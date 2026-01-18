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

        case "Network.getResponseBody":
          console.log("[RemoteDevTools] Network.getResponseBody:", msg.params.requestId);
          const responseData = responseBodyMap.get(msg.params.requestId);
          if (responseData) {
            response.result = {
              body: responseData.body,
              base64Encoded: responseData.base64Encoded
            };
            console.log("[RemoteDevTools] 응답 본문 반환:", msg.params.requestId);
          } else {
            response.error = {
              code: -32000,
              message: `No resource with given identifier found`
            };
            console.warn("[RemoteDevTools] 응답 본문 없음:", msg.params.requestId);
          }
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
  const responseBodyMap = new Map(); // requestId -> response body 저장
  const MAX_RESPONSES = 100; // 최대 저장 개수
  const MAX_BODY_SIZE = 10 * 1024 * 1024; // 최대 응답 크기: 10MB

  // 오래된 응답 정리
  function cleanupOldResponses() {
    if (responseBodyMap.size > MAX_RESPONSES) {
      const entriesToDelete = responseBodyMap.size - MAX_RESPONSES;
      const iterator = responseBodyMap.keys();
      for (let i = 0; i < entriesToDelete; i++) {
        const key = iterator.next().value;
        responseBodyMap.delete(key);
      }
      originalConsole.log(`[RemoteDevTools] 오래된 응답 ${entriesToDelete}개 정리됨`);
    }
  }

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

      return originalFetch.apply(this, args).then(async (response) => {
        const responseTimestamp = performance.now() / 1000;

        originalConsole.log("[RemoteDevTools] 네트워크 응답 수신:", response.status, url);

        // 응답 본문 저장 (response는 스트림이므로 clone 필요)
        const clonedResponse = response.clone();
        try {
          const contentType = response.headers.get('content-type') || '';
          const contentLength = parseInt(response.headers.get('content-length') || '0');

          // 크기가 너무 크면 저장하지 않음
          if (contentLength > MAX_BODY_SIZE) {
            originalConsole.warn(`[RemoteDevTools] 응답이 너무 큼 (${contentLength} bytes), 저장 생략`);
            responseBodyMap.set(requestId, {
              body: `[응답이 너무 큽니다: ${(contentLength / 1024 / 1024).toFixed(2)} MB]`,
              base64Encoded: false
            });
          } else {
            let body;

            if (contentType.includes('application/json')) {
              body = await clonedResponse.text();
            } else if (contentType.includes('text/')) {
              body = await clonedResponse.text();
            } else {
              // 바이너리 데이터는 base64로 인코딩
              const blob = await clonedResponse.blob();

              // 실제 크기 확인
              if (blob.size > MAX_BODY_SIZE) {
                originalConsole.warn(`[RemoteDevTools] Blob이 너무 큼 (${blob.size} bytes), 저장 생략`);
                body = `[응답이 너무 큽니다: ${(blob.size / 1024 / 1024).toFixed(2)} MB]`;
              } else {
                const reader = new FileReader();
                body = await new Promise((resolve) => {
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });
              }
            }

            // 텍스트 응답의 경우 실제 크기 확인
            if (typeof body === 'string' && body.length > MAX_BODY_SIZE) {
              originalConsole.warn(`[RemoteDevTools] 텍스트 응답이 너무 큼 (${body.length} bytes), 잘라냄`);
              body = body.substring(0, MAX_BODY_SIZE) + '\n\n[...응답이 잘렸습니다...]';
            }

            responseBodyMap.set(requestId, {
              body: body,
              base64Encoded: !contentType.includes('text/') && !contentType.includes('application/json')
            });

            originalConsole.log("[RemoteDevTools] 응답 본문 저장됨:", requestId, `(${body?.length || 0} bytes)`);
          }

          // 오래된 응답 정리
          cleanupOldResponses();
        } catch (error) {
          originalConsole.error("[RemoteDevTools] 응답 본문 저장 실패:", error);
        }

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

    // XMLHttpRequest 모니터링 (axios 등)
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const requestId = 'xhr-' + Math.random().toString(36).substring(2, 11);
      let requestUrl = '';
      let requestMethod = 'GET';
      let requestHeaders = {};
      let requestStartTime = 0;
      let requestStartTimestamp = 0;

      // open 메서드 오버라이드
      const originalOpen = xhr.open;
      xhr.open = function(method, url) {
        requestMethod = method;
        requestUrl = url;
        requestStartTime = Date.now() / 1000;
        requestStartTimestamp = performance.now() / 1000;

        originalConsole.log("[RemoteDevTools] XHR 요청 감지:", method, url);

        return originalOpen.apply(this, arguments);
      };

      // setRequestHeader 오버라이드
      const originalSetRequestHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function(header, value) {
        requestHeaders[header] = value;
        return originalSetRequestHeader.apply(this, arguments);
      };

      // send 메서드 오버라이드
      const originalSend = xhr.send;
      xhr.send = function(data) {
        // Network.requestWillBeSent 이벤트
        sendMessage({
          method: "Network.requestWillBeSent",
          params: {
            requestId: requestId,
            loaderId: "loader-1",
            documentURL: window.location.href,
            request: {
              url: requestUrl,
              method: requestMethod,
              headers: requestHeaders,
              initialPriority: "High",
              referrerPolicy: "strict-origin-when-cross-origin",
              postData: data,
            },
            timestamp: requestStartTimestamp,
            wallTime: requestStartTime,
            initiator: {
              type: "script",
              stack: {
                callFrames: []
              }
            },
            type: "XHR",
          },
        });

        // readystatechange 리스너 추가
        xhr.addEventListener('readystatechange', function() {
          if (xhr.readyState === 4) {
            const responseTimestamp = performance.now() / 1000;

            // 응답 본문 저장
            try {
              let body = xhr.responseText || '';
              let base64Encoded = false;

              // 크기 확인
              const bodySize = body.length;
              if (bodySize > MAX_BODY_SIZE) {
                originalConsole.warn(`[RemoteDevTools] XHR 응답이 너무 큼 (${bodySize} bytes), 잘라냄`);
                body = body.substring(0, MAX_BODY_SIZE) + '\n\n[...응답이 잘렸습니다...]';
              }

              // 바이너리 응답인 경우
              if (xhr.responseType === 'blob' || xhr.responseType === 'arraybuffer') {
                base64Encoded = true;
                body = '[바이너리 데이터]';
              }

              responseBodyMap.set(requestId, {
                body: body,
                base64Encoded: base64Encoded
              });

              originalConsole.log("[RemoteDevTools] XHR 응답 본문 저장됨:", requestId, `(${bodySize} bytes)`);

              // 오래된 응답 정리
              cleanupOldResponses();
            } catch (error) {
              originalConsole.error("[RemoteDevTools] XHR 응답 본문 저장 실패:", error);
            }

            // 응답 헤더 파싱
            const responseHeaders = {};
            const headersString = xhr.getAllResponseHeaders();
            if (headersString) {
              headersString.trim().split('\r\n').forEach(line => {
                const parts = line.split(': ');
                if (parts.length === 2) {
                  responseHeaders[parts[0]] = parts[1];
                }
              });
            }

            if (xhr.status >= 200 && xhr.status < 400) {
              originalConsole.log("[RemoteDevTools] XHR 응답 수신:", xhr.status, requestUrl);

              // Network.responseReceived 이벤트
              sendMessage({
                method: "Network.responseReceived",
                params: {
                  requestId: requestId,
                  loaderId: "loader-1",
                  timestamp: responseTimestamp,
                  type: "XHR",
                  response: {
                    url: requestUrl,
                    status: xhr.status,
                    statusText: xhr.statusText,
                    headers: responseHeaders,
                    mimeType: xhr.getResponseHeader('content-type') || 'application/json',
                    connectionReused: false,
                    connectionId: 0,
                    encodedDataLength: 0,
                    fromDiskCache: false,
                    fromServiceWorker: false,
                    protocol: 'http/1.1',
                    timing: {
                      requestTime: requestStartTimestamp,
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
                      receiveHeadersEnd: (responseTimestamp - requestStartTimestamp) * 1000,
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
                  encodedDataLength: xhr.responseText ? xhr.responseText.length : 0,
                },
              });
            } else {
              // 에러 응답
              originalConsole.error("[RemoteDevTools] XHR 오류:", xhr.status, requestUrl);

              // Network.responseReceived 이벤트 (에러도 응답은 받음)
              sendMessage({
                method: "Network.responseReceived",
                params: {
                  requestId: requestId,
                  loaderId: "loader-1",
                  timestamp: responseTimestamp,
                  type: "XHR",
                  response: {
                    url: requestUrl,
                    status: xhr.status,
                    statusText: xhr.statusText,
                    headers: responseHeaders,
                    mimeType: xhr.getResponseHeader('content-type') || 'text/plain',
                    connectionReused: false,
                    connectionId: 0,
                    encodedDataLength: 0,
                    fromDiskCache: false,
                    fromServiceWorker: false,
                    protocol: 'http/1.1',
                    timing: {
                      requestTime: requestStartTimestamp,
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
                      receiveHeadersEnd: (responseTimestamp - requestStartTimestamp) * 1000,
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
                  encodedDataLength: xhr.responseText ? xhr.responseText.length : 0,
                },
              });
            }
          }
        });

        // 에러 이벤트 리스너
        xhr.addEventListener('error', function() {
          const errorTimestamp = performance.now() / 1000;
          originalConsole.error("[RemoteDevTools] XHR 네트워크 오류:", requestUrl);

          sendMessage({
            method: "Network.loadingFailed",
            params: {
              requestId: requestId,
              timestamp: errorTimestamp,
              type: "XHR",
              errorText: "Network error",
              canceled: false,
            },
          });
        });

        // abort 이벤트 리스너
        xhr.addEventListener('abort', function() {
          const abortTimestamp = performance.now() / 1000;
          originalConsole.log("[RemoteDevTools] XHR 요청 취소:", requestUrl);

          sendMessage({
            method: "Network.loadingFailed",
            params: {
              requestId: requestId,
              timestamp: abortTimestamp,
              type: "XHR",
              errorText: "Request aborted",
              canceled: true,
            },
          });
        });

        return originalSend.apply(this, arguments);
      };

      return xhr;
    };

    originalConsole.log("[RemoteDevTools] 네트워크 모니터링 설정 완료 (Fetch + XHR)!");
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
