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