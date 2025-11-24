// serve-devtools.js
const express = require("express");
const path = require("node:path");

const app = express();
const PORT = 3001;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

const devtoolsPath = path.join(__dirname, "out/Default/gen/front_end");
app.use(express.static(devtoolsPath));

app.get("/", async (req, res) => {
  // const cdpResponse = await fetch("http://localhost:9222/json");
  res.sendFile(path.join(devtoolsPath, "inspector.html"));
});

// app.get('/', async (req, res) => {
//   try {
//     const metroResponse = await fetch('http://localhost:8081/json');
//     const metroTargets = await metroResponse.json();

//     const rnTarget = metroTargets[0];
//     const devtoolsFrontendUrl = rnTarget?.devtoolsFrontendUrl;

//     if(!devtoolsFrontendUrl) {
//       throw new Error('[ERROR] metro bundler에서 devtoolsFrontendUrl 정보를 가져올 수 없습니다.');
//     }

//     //TODO: 포트 직접 받도록 기능 추가 필요
//     const metroUrl = `http://127.0.0.1:8081${devtoolsFrontendUrl}`;

//     // CDP 타겟 가져오기
//     const cdpResponse = await fetch('http://localhost:9222/json');
//     const cdpTargets = await cdpResponse.json();

//     const webviewTarget = cdpTargets.find(t => t.url?.includes('localhost:3000'));
//     const cdpUrl = webviewTarget
//       ? `http://localhost:8090/front_end/devtools_app.html?ws=localhost:9222/devtools/page/${webviewTarget.id}`
//       : '';

//       console.log(cdpUrl)

//     // return res.redirect(cdpUrl);
//     res.send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>Unified Debugger</title>
//         <style>
//           body { margin: 0; display: flex; height: 100vh; }
//           iframe { flex: 1; border: none; border-right: 2px solid #333; }
//           iframe:last-child { border-right: none; }
//           .error { padding: 20px; color: red; }
//         </style>
//       </head>
//       <body>
//         ${metroUrl ? `<iframe src="${metroUrl}"></iframe>` : '<div class="error">Metro debugger not found</div>'}
//         ${cdpUrl ? `<iframe src="${cdpUrl}"></iframe>` : '<div class="error">Metro debugger not found</div>'}

//       </body>
//       </html>
//     `);
//   } catch (error) {
//     res.send(`Error: ${error.message}`);
//   }
// });

app.listen(PORT, () => {
  console.log(`devtool : http://localhost:${PORT}`);
});
