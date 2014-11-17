import './iframe.css!';


export class ReEstablishTimeout extends Error {};

export function reEstablishSession(loginUrl, maxWait) {
    var iframe = createIframe(loginUrl);
    var timeout = delay(maxWait).then(() => { throw new ReEstablishTimeout; });
    var reEstablished = waitForIframe(iframe, timeout);

    loadIframe(iframe);
    return Promise.race([reEstablished, timeout]).then(
        () => { unloadIframe(iframe); },
        () => { unloadIframe(iframe); }
    );
}


/* Helpers to observe the iframe */

function waitForIframe(iframe, timeout) {
    return new Promise((resolve, _) => {
        iframe.addEventListener('load', resolve);
    }).then(event => {
        return waitForLocation(iframe, timeout);
    });
}

function waitForLocation(iframe, timeout) {
    var throttleDelay = 50; // ms

    return tryReadingIframeLocation(iframe).
        catch(() => {
            // Race with timeout which rejects the promise and breaks the
            // infinite loop
            return Promise.race([delay(throttleDelay), timeout]).
                then(() => waitForLocation(iframe, timeout));
        });
}

function tryReadingIframeLocation(iframe) {
    return new Promise((resolve, reject) => {
        try {
            // When logged out, google auth refuses to load in an iframe by setting the X-Frame-Options header
            // we can sort of detect this by checking the location of the iframe
            // if the contentDocument object cannot be accessed, its due to a security error.
            // security error will occur when the frame is on a different origin
            resolve(iframe.contentDocument.location);
        } catch(e) {
            reject(e);
        }
    });
}


/* Helpers to manage the lifecycle of the iframe in the DOM */

function createIframe(loginUrl) {
    var iframe = document.createElement('iframe');
    iframe.classList.add('panda-session-iframe');

    iframe.src = loginUrl;
    return iframe;
}

function loadIframe(iframe) {
    document.body.appendChild(iframe);
}

function unloadIframe(iframe) {
    document.body.removeChild(iframe);
}


/* Generic helpers */

// Returns a promise that resolves with undefined after a delay
function delay(duration) {
    return new Promise((resolve, _) => {
        setTimeout(resolve, duration);
    });
}
