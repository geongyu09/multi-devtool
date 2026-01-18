(function () {
  "use strict";

  const SERVER_URL = "ws://localhost:3002";
  const ws = new WebSocket(SERVER_URL);

  // 노드 ID 매핑
  const nodeIdMap = new WeakMap();
  const nodeMap = new Map();
  let nextNodeId = 1;

  ws.onopen = () => {
    console.log("[RemoteDevTools] 서버에 연결됨");

    // 페이지 등록
    ws.send(
      JSON.stringify({
        type: "register",
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
      }),
    );
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "registered") {
      console.log("[RemoteDevTools] 등록 완료! ID:", msg.id);
    } else if (msg.method) {
      // CDP 메시지 처리
      handleCDPMessage(msg);
    }
  };

  ws.onerror = (error) => {
    console.error("[RemoteDevTools] 연결 오류:", error);
  };

  ws.onclose = () => {
    console.log("[RemoteDevTools] 연결 종료");
  };

  // 연결 유지 (30초마다)
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, 30000);

  // CDP 메시지 처리
  function handleCDPMessage(msg) {
    const response = {
      id: msg.id,
    };

    try {
      switch (msg.method) {
        case "Runtime.enable":
          response.result = {};
          break;

        case "Runtime.evaluate":
          response.result = evaluateExpression(msg.params.expression);
          break;

        case "DOM.getDocument":
          response.result = {
            root: buildDOMNode(document.documentElement),
          };
          break;

        case "DOM.querySelector":
          const element = document.querySelector(msg.params.selector);
          response.result = {
            nodeId: element ? getNodeId(element) : 0,
          };
          break;

        case "DOM.getOuterHTML":
          const node = nodeMap.get(msg.params.nodeId);
          response.result = {
            outerHTML: node ? node.outerHTML : "",
          };
          break;

        case "CSS.getComputedStyleForNode":
          const styleNode = nodeMap.get(msg.params.nodeId);
          if (styleNode) {
            const styles = window.getComputedStyle(styleNode);
            response.result = {
              computedStyle: Array.from(styles).map((name) => ({
                name,
                value: styles.getPropertyValue(name),
              })),
            };
          } else {
            response.result = { computedStyle: [] };
          }
          break;

        case "Network.enable":
          setupNetworkMonitoring();
          response.result = {};
          break;

        case "Console.enable":
          setupConsoleCapture();
          response.result = {};
          break;

        case "Debugger.enable":
        case "Profiler.enable":
        case "HeapProfiler.enable":
        case "Page.enable":
        case "Overlay.enable":
          response.result = {};
          break;

        default:
          console.log("[RemoteDevTools] 미지원 메서드:", msg.method);
          response.result = {};
      }
    } catch (error) {
      response.error = {
        code: -32000,
        message: error.message,
      };
    }

    sendMessage(response);
  }

  // JavaScript 실행
  // ⚠️ 보안 경고: eval 사용 - 프로덕션 환경에서는 샌드박스 처리 필요
  function evaluateExpression(expression) {
    try {
      const result = eval(expression);
      return {
        result: {
          type: typeof result,
          value: result,
          description: String(result),
        },
      };
    } catch (error) {
      return {
        exceptionDetails: {
          text: error.message,
          exception: {
            type: "object",
            subtype: "error",
            description: error.toString(),
          },
        },
      };
    }
  }

  // 노드 ID 관리
  function getNodeId(node) {
    if (!nodeIdMap.has(node)) {
      const id = nextNodeId++;
      nodeIdMap.set(node, id);
      nodeMap.set(id, node);
    }
    return nodeIdMap.get(node);
  }

  // DOM 노드를 CDP 형식으로 변환
  function buildDOMNode(node) {
    const nodeId = getNodeId(node);
    const result = {
      nodeId,
      nodeType: node.nodeType,
      nodeName: node.nodeName,
      localName: node.localName,
      nodeValue: node.nodeValue,
    };

    if (node.attributes) {
      result.attributes = [];
      for (let attr of node.attributes) {
        result.attributes.push(attr.name, attr.value);
      }
    }

    if (node.childNodes && node.childNodes.length > 0) {
      result.childNodeCount = node.childNodes.length;
      result.children = Array.from(node.childNodes).map((child) =>
        buildDOMNode(child),
      );
    }

    return result;
  }

  // 네트워크 모니터링
  let networkMonitoringEnabled = false;
  function setupNetworkMonitoring() {
    if (networkMonitoringEnabled) return;
    networkMonitoringEnabled = true;

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const requestId = Math.random().toString(36).substr(2);

      sendMessage({
        method: "Network.requestWillBeSent",
        params: {
          requestId,
          request: {
            url: typeof args[0] === "string" ? args[0] : args[0].url,
            method: args[1]?.method || "GET",
          },
          timestamp: Date.now() / 1000,
        },
      });

      return originalFetch.apply(this, args).then((response) => {
        sendMessage({
          method: "Network.responseReceived",
          params: {
            requestId,
            response: {
              url: response.url,
              status: response.status,
              statusText: response.statusText,
            },
            timestamp: Date.now() / 1000,
          },
        });

        return response;
      });
    };
  }

  // 콘솔 캡처
  let consoleEnabled = false;
  function setupConsoleCapture() {
    if (consoleEnabled) return;
    consoleEnabled = true;

    const methods = ["log", "error", "warn", "info", "debug"];

    methods.forEach((method) => {
      const original = console[method];
      console[method] = function (...args) {
        sendMessage({
          method: "Runtime.consoleAPICalled",
          params: {
            type: method,
            args: args.map((arg) => ({
              type: typeof arg,
              value: arg,
              description: String(arg),
            })),
            timestamp: Date.now() / 1000,
            stackTrace: { callFrames: [] },
          },
        });
        original.apply(console, args);
      };
    });
  }

  // 메시지 전송
  function sendMessage(message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
})();
