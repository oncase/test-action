const core = require("@actions/core");
const axios = require("axios");
const fs = require("fs");
const newman = require("newman");
const { exit } = require("process");
const cp = require("child_process");

function getDataFromPostman(url) {
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };
  axios.defaults.headers.common = {
    "X-API-Key": core.getInput("postman_api_key"),
  };
  return axios({
    method: "get",
    url: url,
    config,
  }).then((res) => res.data);
}

function runCLITests(collection, env) {
  fs.writeFileSync("collection_test.json", JSON.stringify(collection), "utf8");

  fs.writeFileSync("env_test.json", JSON.stringify(env), "utf8");

  cp.execSync(`npm install -g newman @oncase/newman-reporter-slackmsg`, {
    env: process.env,
  }).toString();

  const result = cp
    .execSync(
      `newman run collection_test.json -e env_test.json --timeout-request ${core.getInput(
        "request_timeout"
      )} --suppress-exit-code -r @oncase/slackmsg --reporter-@oncase/slackmsg-webhookurl ${core.getInput(
        "slack_msg_webhook"
      )}`,
      { env: process.env }
    )
    .toString();

  fs.unlinkSync("env_test.json");

  fs.unlinkSync("collection_test.json");

  console.log(result);
}

function runSdkTests(collection, env) {
  newman.run(
    {
      collection: collection,
      environment: env,
      timeoutRequest: parseInt(core.getInput("request_timeout")),
      reporter: "cli",
    },
    function (err, summary) {
      if (err) {
        console.log(err);
        core.setFailed(err);
        exit(-1);
      }

      if (summary.run.failures.length) {
        const testNames = summary.run.failures.map((item) => item.source.name);
        const failedTestsMsg = `Tests ${testNames} have failed`;
        console.warn(failedTestsMsg);

        if (core.getInput("continue_if_fail") !== "true") {
          core.setFailed(failedTestsMsg);
          exit(-1);
        }
      }

      console.log("collection run complete!");
      core.setOutput("output", "");
    }
  );
}

async function run() {
  //data from postman
  const collectionUrl =
    core.getInput("postman_api_url") +
    "collections/" +
    core.getInput("postman_collection_id");

  const envUrl =
    core.getInput("postman_api_url") +
    "environments/" +
    core.getInput("postman_env_id");

  console.log("Getting collection and environment from postman");
  const collection = await getDataFromPostman(collectionUrl);
  const postmanEnv = await getDataFromPostman(envUrl);

  console.log("Done!");

  console.log("Checking missing tests");

  const testUrls = collection.collection.item.map((item) =>
    item.request.url.raw.replace("{{host}}", "")
  );

  const apiUrls = JSON.parse(
    fs.readFileSync("backend/" + core.getInput("url_list_filename"), "utf8")
  );

  const apiListKey = Object.keys(apiUrls)[0];

  const missingTestUrls = [];

  for (let url of apiUrls[apiListKey]) {
    if (!testUrls.includes(url)) missingTestUrls.push(url);
  }

  if (missingTestUrls.length) {
    const missingTestMsg = `Urls ${missingTestUrls} have no registered tests`;
    console.warn(missingTestMsg);
    if (core.getInput("continue_if_test_missing") !== "true") {
      core.setFailed(missingTestMsg);
      exit(-1);
    }
  }

  console.log("Done!");

  console.log("Running tests");

  postmanEnv.environment.values = postmanEnv.environment.values.map((item) => {
    if (item.key === "host") {
      return {
        ...item,
        value: item.value.replace("{{host}}", core.getInput("host_url")),
      };
    } else return item;
  });

  runCLITests(collection.collection, postmanEnv.environment);
  runSdkTests(collection.collection, postmanEnv.environment);
}

run();
