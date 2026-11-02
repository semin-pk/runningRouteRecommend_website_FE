function handler(event) {
  var request = event.request;
  if (request.uri === "/agent" || request.uri === "/agent/") {
    request.uri = "/agent/index.html";
  }
  return request;
}
