const process = require("process");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// shows how the runner will run a javascript action with env / stdout protocol
test("test runs", () => {
  fs.writeFileSync(
    process.env.INPUT_URL_LIST_FILENAME,
    JSON.stringify({
      data: [
        "/rec-customer-product",
        "/event",
        "/year",
        "/user",
        "/city",
        "/port",
      ],
    }),
    "utf8"
  );

  const ip = path.join(__dirname, "index.js");
  const result = cp.execSync(`node ${ip}`, { env: process.env }).toString();
  console.log(result);

  fs.unlinkSync(process.env.INPUT_URL_LIST_FILENAME);
});
