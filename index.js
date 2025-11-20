// serve-devtools.js
const express = require("express");

const app = express();
const PORT = 13000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// const devtoolsPath = path.join(__dirname, 'out/Default/gen/front_end');
// app.use(express.static(devtoolsPath));

app.get("/", async (req, res) => {
  try {
    const metroResponse = await fetch("http://localhost:8081/json");
    const metroTargets = await metroResponse.json();

    const rnTarget = metroTargets[0];
    const devtoolsFrontendUrl = rnTarget?.devtoolsFrontendUrl;

    if (!devtoolsFrontendUrl) {
      throw new Error(
        "[ERROR] metro bundler에서 devtoolsFrontendUrl 정보를 가져올 수 없습니다."
      );
    }

    //TODO: 포트 직접 받도록 기능 추가 필요
    const metroUrl = `http://127.0.0.1:8081${devtoolsFrontendUrl}`;

    return res.redirect(metroUrl);
  } catch (error) {
    res.send(`Error: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`devtool : http://localhost:${PORT}`);
});
