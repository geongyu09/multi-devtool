# Unified Debugger Service

## 개요

React Native(Expo)와 WebView를 동시에 디버깅할 수 있는 통합 개발자 도구 서비스입니다.

### 배경

Expo 기반 React Native 앱에서 WebView 컴포넌트를 사용할 경우, 앱과 웹뷰를 각각 별도의 도구로 디버깅해야 하는 불편함이 있습니다. 본 프로젝트는 Chrome DevTools를 활용하여 **단일 인터페이스에서 앱과 웹뷰를 동시에 디버깅**할 수 있는 환경을 제공합니다.

### 주요 기능

- **React Native 디버깅**: Metro 번들러와 연동하여 Expo 앱의 디버깅 정보 제공
- **WebView 디버깅**: Chrome DevTools Protocol(CDP)을 통한 웹뷰 콘텐츠 디버깅
- **통합 인터페이스**: 한 화면에서 앱과 웹뷰의 디버깅 정보를 동시에 확인

### 기술 스택

- **Runtime**: Node.js
- **Server**: Express.js
- **Protocol**: Chrome DevTools Protocol (CDP)
- **Communication**: WebSocket
- **UI**: Chrome DevTools Frontend

---

## 🚀 빠른 시작

### 설치

```bash
# 의존성 설치
npm install
```

### 실행

**1단계: CDP 프록시 서버 실행 (필수)**

```bash
node cdp-proxy.js
```

✅ 서버 실행 확인: `CDP Proxy running on http://localhost:3002`

**2단계: DevTools UI 서버 실행 (선택)**

```bash
node web.js
```

✅ 서버 실행 확인: `DevTools Frontend running on http://localhost:3001`

### 사용 방법

#### 옵션 1: 테스트 페이지 사용

브라우저에서 테스트 페이지를 엽니다:

```
http://localhost:3002/unified-test.html
```

#### 옵션 2: 웹페이지에 스크립트 추가

디버깅하려는 웹페이지에 클라이언트 스크립트를 삽입합니다.

**1. HTML 파일 열기**

디버깅하려는 웹페이지의 HTML 파일을 편집기로 엽니다.

**2. 스크립트 태그 추가**

`<head>` 또는 `<body>` 태그 내에 다음 스크립트를 추가합니다:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 다른 스크립트보다 먼저 로드하는 것을 권장 -->
  <script src="http://localhost:3002/devtools-client.js"></script>

  <!-- 기타 스크립트 및 스타일시트 -->
</head>
<body>
  <!-- 페이지 콘텐츠 -->
</body>
</html>
```

**3. 페이지 로드**

웹페이지를 브라우저에서 로드하면 자동으로 CDP 프록시에 등록됩니다.

**4. 등록 확인**

브라우저 콘솔에서 다음 메시지를 확인:
```
[DevTools] Registered with ID: 1234567890
```

또는 CDP 프록시 콘솔에서:
```
New page registered: <페이지 제목>
```

### 디버깅

#### 방법 A: Chrome Inspect 사용

1. Chrome 브라우저에서 `chrome://inspect` 접속
2. **Configure** 버튼 클릭
3. `localhost:3002` 추가
4. **Remote Target** 섹션에서 페이지 확인 후 **inspect** 클릭

#### 방법 B: Web UI 사용

1. `http://localhost:3001` 접속
2. 등록된 페이지 목록에서 **Inspect** 버튼 클릭

---

## 📂 프로젝트 구조

```
serving/
├── cdp-proxy.js              # CDP 프록시 서버 (포트 3002) ⭐️ 핵심
├── web.js                    # DevTools UI 서버 (포트 3001)
├── index.js                  # Metro 리다이렉트 서버 (포트 13000)
│
├── public/
│   ├── devtools-client.js    # 웹페이지 주입 스크립트 ⭐️ 핵심
│   └── unified-test.html     # 테스트 페이지
│
├── out/                      # Chrome DevTools Frontend 빌드
│
├── CLAUDE.md                 # 프로젝트 상세 가이드
├── CDP_PROXY_GUIDE.md        # CDP 프록시 문서
└── USAGE.md                  # 사용 가이드
```

---

## ✨ 지원 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| 콘솔 로그 | ✅ | console.log/error/warn/info/debug 캡처 |
| 네트워크 모니터링 | ✅ | Fetch, XMLHttpRequest 요청/응답 추적 |
| DOM 탐색 | ✅ | DOM 트리 구조 조회 및 탐색 |
| CSS 스타일 | ✅ | 계산된 스타일 조회 |
| Storage | ✅ | localStorage, sessionStorage, Cookie 관리 |
| IndexedDB | ✅ | 데이터베이스 목록 조회 |
| CacheStorage | ✅ | Cache 조회 |
| 디버거 | ✅ | 스크립트 소스 조회, 기본 디버깅 |

---

## 🛠️ 트러블슈팅

### 페이지가 등록되지 않을 때

1. CDP 프록시 서버가 실행 중인지 확인:
   ```bash
   curl http://localhost:3002/json
   ```

2. 웹페이지 콘솔에서 WebSocket 연결 에러 확인

3. 스크립트가 올바르게 로드되었는지 확인:
   ```
   http://localhost:3002/devtools-client.js
   ```

### DevTools에서 연결되지 않을 때

1. `chrome://inspect`에서 `localhost:3002` 설정 확인

2. 등록된 페이지 목록 확인:
   ```bash
   curl http://localhost:3002/api/pages
   ```

3. WebSocket 연결 로그 확인 (cdp-proxy.js 콘솔)

### 네트워크 요청이 표시되지 않을 때

1. DevTools의 Network 탭이 활성화되었는지 확인
2. 페이지 로드 후 네트워크 요청이 발생했는지 확인
3. devtools-client.js가 요청 전에 로드되었는지 확인

---

## 📖 상세 문서

- **CLAUDE.md**: 프로젝트 전체 가이드 (개발자용)
- **CDP_PROXY_GUIDE.md**: CDP 프록시 상세 문서
- **USAGE.md**: 사용 가이드

---

## 구현 요구사항

목표 : 웹뷰 환경에서 앱과 웹을 동시에 디버깅할 수 있는 서비스를 구현한다. 

세부 구현사항

- 디버깅 도구는 크롬 개발자 도구(Chrome DevTools)를 사용한다.
- 한 화면 내에서 앱과 웹뷰의 디버깅 정보를 동시에 표시한다.
- 디버깅 타깃은 Expo 기반의 React Native 및 Webview 컴포넌트를 사용한 서비스이다. 

### 요구사항 분석 

1. 앱
  - Expo 기반의 React Native 앱에서 디버깅 정보를 추출할 수 있어야 한다.

2. 웹뷰
  - 웹뷰 내에서 로드된 웹 페이지의 디버깅 정보를 추출할 수 있어야 한다.