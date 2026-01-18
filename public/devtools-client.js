(function () {
  "use strict";

  const SERVER_URL = "ws://localhost:3002";
  const ws = new WebSocket(SERVER_URL);

  // 원본 콘솔 메서드 저장 (오버라이드 전에 저장)
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  // 노드 ID 매핑
  const nodeIdMap = new WeakMap();
  const nodeMap = new Map();
  let nextNodeId = 1;

  // 스크립트 관리
  const scripts = new Map(); // scriptId -> script 정보
  let nextScriptId = 1;
  let debuggerEnabled = false;

  // 스크립트 수집 함수
  function collectScripts() {
    originalConsole.log("[RemoteDevTools] 스크립트 수집 시작...");

    const scriptElements = document.querySelectorAll('script');

    scriptElements.forEach((scriptEl, index) => {
      const scriptId = String(nextScriptId++);
      const src = scriptEl.src;
      const isInline = !src;

      const scriptInfo = {
        scriptId: scriptId,
        url: src || window.location.href,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
        executionContextId: 1,
        hash: '',
        isLiveEdit: false,
        sourceMapURL: '',
        hasSourceURL: false,
        isModule: scriptEl.type === 'module',
        length: 0,
        source: '',
      };

      if (isInline) {
        // 인라인 스크립트
        scriptInfo.source = scriptEl.textContent || '';
        scriptInfo.length = scriptInfo.source.length;
        scriptInfo.url = `${window.location.href}#inline-${index}`;
        originalConsole.log(`[RemoteDevTools] 인라인 스크립트 발견: ${scriptInfo.url}`);
      } else {
        // 외부 스크립트 - 나중에 fetch로 가져올 예정
        scriptInfo.url = src;
        scriptInfo.source = null; // 아직 로드 안됨
        originalConsole.log(`[RemoteDevTools] 외부 스크립트 발견: ${src}`);
      }

      scripts.set(scriptId, scriptInfo);
    });

    originalConsole.log(`[RemoteDevTools] 총 ${scripts.size}개의 스크립트 수집 완료`);
  }

  // DevTools에 스크립트 정보 전송
  function notifyScriptParsed(scriptInfo) {
    sendMessage({
      method: 'Debugger.scriptParsed',
      params: {
        scriptId: scriptInfo.scriptId,
        url: scriptInfo.url,
        startLine: scriptInfo.startLine,
        startColumn: scriptInfo.startColumn,
        endLine: scriptInfo.endLine,
        endColumn: scriptInfo.endColumn,
        executionContextId: scriptInfo.executionContextId,
        hash: scriptInfo.hash,
        isLiveEdit: scriptInfo.isLiveEdit,
        sourceMapURL: scriptInfo.sourceMapURL,
        hasSourceURL: scriptInfo.hasSourceURL,
        isModule: scriptInfo.isModule,
        length: scriptInfo.length,
      },
    });
  }

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

  ws.onmessage = async (event) => {
    let data = event.data;

    // Blob인 경우 텍스트로 변환
    if (data instanceof Blob) {
      console.log("[RemoteDevTools] Blob 메시지 수신, 텍스트로 변환 중...");
      data = await data.text();
    }

    console.log("[RemoteDevTools] 메시지 수신 (raw):", data);

    try {
      const msg = JSON.parse(data);
      console.log("[RemoteDevTools] 메시지 파싱 완료:", msg);

      if (msg.type === "registered") {
        console.log("[RemoteDevTools] 등록 완료! ID:", msg.id);
      } else if (msg.type === "pong") {
        // ping 응답 무시
      } else if (msg.method || msg.id) {
        // CDP 메시지 처리 (요청이든 응답이든)
        handleCDPMessage(msg);
      } else {
        console.warn("[RemoteDevTools] 알 수 없는 메시지:", msg);
      }
    } catch (error) {
      console.error("[RemoteDevTools] JSON 파싱 오류:", error, "데이터:", data);
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
    // CDP 요청이 아니면 무시 (응답 메시지는 처리하지 않음)
    if (!msg.method) {
      console.log("[RemoteDevTools] CDP 응답 메시지 무시:", msg);
      return;
    }

    console.log("[RemoteDevTools] CDP 요청 처리:", msg.method);

    const response = {
      id: msg.id,
    };

    try {
      switch (msg.method) {
        case "Runtime.enable":
          console.log("[RemoteDevTools] Runtime.enable 처리");
          response.result = {};
          break;

        case "Runtime.evaluate":
          console.log("[RemoteDevTools] Runtime.evaluate:", msg.params.expression);
          response.result = evaluateExpression(msg.params.expression);
          break;

        case "DOM.getDocument":
          console.log("[RemoteDevTools] DOM.getDocument 처리");
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
          console.log("[RemoteDevTools] Network.enable 처리");
          setupNetworkMonitoring();
          response.result = {};
          break;

        case "Console.enable":
        case "Log.enable":
        case "Log.startViolationsReport":
          console.log("[RemoteDevTools] Console/Log.enable 처리 - 콘솔 캡처 시작");
          setupConsoleCapture();
          response.result = {};
          break;

        case "Debugger.enable":
          console.log("[RemoteDevTools] Debugger.enable 처리");
          if (!debuggerEnabled) {
            debuggerEnabled = true;
            // 스크립트 수집
            collectScripts();
            // 모든 스크립트 정보 전송
            scripts.forEach(scriptInfo => {
              notifyScriptParsed(scriptInfo);
            });
          }
          response.result = {
            debuggerId: "debugger-1"
          };
          break;

        case "Debugger.getScriptSource":
          console.log("[RemoteDevTools] Debugger.getScriptSource:", msg.params.scriptId);
          const script = scripts.get(msg.params.scriptId);
          if (script) {
            // 외부 스크립트인 경우 fetch로 가져오기
            if (script.source === null) {
              response.result = {
                scriptSource: `// 외부 스크립트: ${script.url}\n// 소스를 가져올 수 없습니다.`
              };
            } else {
              response.result = {
                scriptSource: script.source
              };
            }
          } else {
            response.error = {
              code: -32000,
              message: `Script not found: ${msg.params.scriptId}`
            };
          }
          break;

        case "Page.getResourceTree":
          console.log("[RemoteDevTools] Page.getResourceTree 처리");
          // 리소스 트리 구성
          const resources = [];

          // 스크립트 리소스 추가
          scripts.forEach(scriptInfo => {
            if (scriptInfo.url && !scriptInfo.url.includes('#inline')) {
              resources.push({
                url: scriptInfo.url,
                type: 'Script',
                mimeType: 'text/javascript'
              });
            }
          });

          // CSS 리소스 추가
          document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            resources.push({
              url: link.href,
              type: 'Stylesheet',
              mimeType: 'text/css'
            });
          });

          response.result = {
            frameTree: {
              frame: {
                id: 'main-frame',
                loaderId: 'loader-1',
                url: window.location.href,
                securityOrigin: window.location.origin,
                mimeType: 'text/html'
              },
              resources: resources
            }
          };
          break;

        case "Runtime.addBinding":
        case "Network.setAttachDebugStack":
        case "Network.setBlockedURLs":
        case "Network.clearAcceptedEncodingsOverride":
        case "Page.getNavigationHistory":
        case "Page.startScreencast":
        case "Page.addScriptToEvaluateOnNewDocument":
        case "Page.setAdBlockingEnabled":
        case "DOM.enable":
        case "CSS.enable":
        case "Debugger.setPauseOnExceptions":
        case "Debugger.setAsyncCallStackDepth":
        case "Debugger.setBlackboxPatterns":
        case "DOMDebugger.setBreakOnCSPViolation":
        case "Profiler.enable":
        case "HeapProfiler.enable":
        case "Page.enable":
        case "Overlay.enable":
        case "Overlay.setShowViewportSizeOnResize":
        case "Overlay.setShowGridOverlays":
        case "Overlay.setShowFlexOverlays":
        case "Overlay.setShowScrollSnapOverlays":
        case "Overlay.setShowContainerQueryOverlays":
        case "Overlay.setShowIsolatedElements":
        case "Animation.enable":
        case "Autofill.enable":
        case "Autofill.setAddresses":
        case "Emulation.setEmulatedMedia":
        case "Emulation.setEmulatedVisionDeficiency":
        case "Emulation.setFocusEmulationEnabled":
        case "Audits.enable":
        case "ServiceWorker.enable":
        case "Inspector.enable":
        case "Target.setAutoAttach":
        case "Target.setDiscoverTargets":
        case "Target.setRemoteLocations":
        case "Runtime.runIfWaitingForDebugger":
          response.result = {};
          break;

        default:
          console.log("[RemoteDevTools] 미지원 메서드:", msg.method);
          response.result = {};
      }
    } catch (error) {
      console.error("[RemoteDevTools] CDP 처리 오류:", error);
      response.error = {
        code: -32000,
        message: error.message,
      };
    }

    console.log("[RemoteDevTools] CDP 응답 전송:", response);
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
    if (networkMonitoringEnabled) {
      originalConsole.log("[RemoteDevTools] 네트워크 모니터링 이미 활성화됨");
      return;
    }
    networkMonitoringEnabled = true;

    originalConsole.log("[RemoteDevTools] 네트워크 모니터링 설정 중...");

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const requestId = 'fetch-' + Math.random().toString(36).substring(2, 11);
      const url = typeof args[0] === "string" ? args[0] : args[0].url;
      const method = args[1]?.method || "GET";
      const headers = args[1]?.headers || {};

      const wallTime = Date.now() / 1000;
      const timestamp = performance.now() / 1000;

      originalConsole.log("[RemoteDevTools] 네트워크 요청 감지:", method, url);

      // Network.requestWillBeSent 이벤트
      sendMessage({
        method: "Network.requestWillBeSent",
        params: {
          requestId: requestId,
          loaderId: "loader-1",
          documentURL: window.location.href,
          request: {
            url: url,
            method: method,
            headers: headers,
            initialPriority: "High",
            referrerPolicy: "strict-origin-when-cross-origin",
          },
          timestamp: timestamp,
          wallTime: wallTime,
          initiator: {
            type: "script",
            stack: {
              callFrames: []
            }
          },
          type: "Fetch",
        },
      });

      return originalFetch.apply(this, args).then((response) => {
        const responseTimestamp = performance.now() / 1000;

        originalConsole.log("[RemoteDevTools] 네트워크 응답 수신:", response.status, url);

        // 응답 헤더 추출
        const responseHeaders = {};
        if (response.headers) {
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
        }

        // Network.responseReceived 이벤트
        sendMessage({
          method: "Network.responseReceived",
          params: {
            requestId: requestId,
            loaderId: "loader-1",
            timestamp: responseTimestamp,
            type: "Fetch",
            response: {
              url: response.url,
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders,
              mimeType: response.headers.get('content-type') || 'application/json',
              connectionReused: false,
              connectionId: 0,
              encodedDataLength: 0,
              fromDiskCache: false,
              fromServiceWorker: false,
              protocol: 'http/1.1',
              timing: {
                requestTime: timestamp,
                proxyStart: -1,
                proxyEnd: -1,
                dnsStart: -1,
                dnsEnd: -1,
                connectStart: -1,
                connectEnd: -1,
                sslStart: -1,
                sslEnd: -1,
                workerStart: -1,
                workerReady: -1,
                sendStart: 0,
                sendEnd: 0,
                receiveHeadersEnd: (responseTimestamp - timestamp) * 1000,
              }
            },
          },
        });

        // Network.loadingFinished 이벤트
        sendMessage({
          method: "Network.loadingFinished",
          params: {
            requestId: requestId,
            timestamp: responseTimestamp,
            encodedDataLength: 0,
          },
        });

        return response;
      }).catch((error) => {
        const errorTimestamp = performance.now() / 1000;

        originalConsole.error("[RemoteDevTools] 네트워크 오류:", error);

        // Network.loadingFailed 이벤트
        sendMessage({
          method: "Network.loadingFailed",
          params: {
            requestId: requestId,
            timestamp: errorTimestamp,
            type: "Fetch",
            errorText: error.message,
            canceled: false,
          },
        });

        throw error;
      });
    };

    originalConsole.log("[RemoteDevTools] 네트워크 모니터링 설정 완료!");
  }

  // 콘솔 캡처
  let consoleEnabled = false;
  function setupConsoleCapture() {
    if (consoleEnabled) {
      originalConsole.log("[RemoteDevTools] 콘솔 캡처 이미 활성화됨");
      return;
    }
    consoleEnabled = true;

    const methods = ["log", "error", "warn", "info", "debug"];

    originalConsole.log("[RemoteDevTools] 콘솔 캡처 설정 시작...", methods);

    methods.forEach((method) => {
      const original = originalConsole[method];
      console[method] = function (...args) {
        // CDP 로그 메시지는 무한 루프 방지를 위해 필터링
        const firstArg = args[0];
        if (typeof firstArg === 'string' && firstArg.startsWith('[RemoteDevTools]')) {
          original.apply(console, args);
          return;
        }

        const cdpMessage = {
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
        };

        // 원래 콘솔 함수 호출 (브라우저 콘솔에 출력)
        original.apply(console, args);

        // CDP로 전송
        originalConsole.log("[RemoteDevTools] 콘솔 이벤트 전송:", method, args);
        sendMessage(cdpMessage);
      };
    });

    originalConsole.log("[RemoteDevTools] 콘솔 캡처 설정 완료!");
  }

  // 메시지 전송
  function sendMessage(message) {
    if (ws.readyState === WebSocket.OPEN) {
      const jsonStr = JSON.stringify(message);
      console.log("[RemoteDevTools] 메시지 전송:", jsonStr.substring(0, 200));
      ws.send(jsonStr);
    } else {
      console.error("[RemoteDevTools] WebSocket이 열려있지 않음. 상태:", ws.readyState);
    }
  }
})();
