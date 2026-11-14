// Sends www.openthrone.dev to the apex domain, keeping the path and query.
const wwwRedirect = {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'openthrone.dev';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  },
};

export default wwwRedirect;
