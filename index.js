const core = require("@actions/core");
const axios = require("axios");
const fs = require("fs");
const newman = require("newman");
const { exit } = require("process");

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
  //missing tests check
  const testUrls = collection.collection.item.map((item) =>
    item.request.url.raw.replace("{{host}}", "")
  );

  const apiUrls = JSON.parse(
    fs.readFileSync(core.getInput("url_list_filename"), "utf8")
  );

  const apiListKey = Object.keys(apiUrls)[0];

  const missingTestUrls = [];

  for (let url of apiUrls[apiListKey]) {
    if (!testUrls.includes(url)) missingTestUrls.push(url);
  }

  if (missingTestUrls.length) {
    const missingTestMsg = `Urls ${missingTestUrls} have no registered tests`;
    console.log(missingTestMsg);
    if (core.getInput("continue_if_test_missing") !== "true") {
      core.setFailed(missingTestMsg);
      exit(-1);
    }
  }

  console.log("Done!");

  console.log("Running tests");
  //running tests
  newman.run(
    {
      collection: collection.collection,
      environment: postmanEnv.environment,
      reporters: "@oncase/slackmsg",
      reporter: {
        "@oncase/slackmsg": {
          webhookurl:
            "https://hooks.slack.com/services/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",
        },
      },
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
        console.log(failedTestsMsg);

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

run();
