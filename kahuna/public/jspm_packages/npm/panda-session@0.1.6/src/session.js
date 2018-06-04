/* */ 
export class ReEstablishTimeout extends Error {};
export class GoogleAuthException extends Error {};

class NotReadyException extends Error {};

export const reEstablishSession = oneAtATime(reEstablishSessionImpl);


function reEstablishSessionImpl(loginUrl, maxWait) {
    var iframe = createIframe(loginUrl);
    var timeout = delay(maxWait).then(() => { throw new ReEstablishTimeout; });
    var reEstablished = waitForIframe(iframe, timeout);

    loadIframe(iframe);
    return Promise.race([reEstablished, timeout]).then(
        _ => { unloadIframe(iframe); },
        e => { unloadIframe(iframe); throw e; }
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
        catch(error => {
            if (error instanceof NotReadyException) {
                // Race with timeout which rejects the promise and breaks the
                // infinite loop
                return Promise.race([delay(throttleDelay), timeout]).
                    then(() => waitForLocation(iframe, timeout));
            } else {
                return Promise.reject(error);
            }
        });
}

function tryReadingIframeLocation(iframe) {
    return new Promise((resolve, reject) => {
        try {
            // When logged out, google auth refuses to load in an iframe by setting the X-Frame-Options header
            // we can sort of detect this by checking the location of the iframe
            // if the contentDocument object cannot be accessed, its due to a security error.
            // security error will occur when the frame is on a different origin

            // Heuristic to detect google auth error in the iframe document
            const textContent = iframe.contentDocument.body.textContent;
            if (textContent.indexOf('google-auth-exception') !== -1) {
                console.log('Google Auth Exception: ', textContent);
                reject(new GoogleAuthException(textContent));
            } else {
                resolve(iframe.contentDocument.location);
            }
        } catch(e) {
            reject(new NotReadyException);
        }
    });
}


/* Helpers to manage the lifecycle of the iframe in the DOM */

function createIframe(loginUrl) {
    var iframe = document.createElement('iframe');
    iframe.classList.add('panda-session-iframe');
    // The re-auth iframe should not be shown
    iframe.style.display = 'none';

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

// Takes a function that returns a Promise and
function oneAtATime(func) {
    let currentExecution;

    const reset = () => currentExecution = undefined;

    return (...args) => {
        if (currentExecution) {
            return currentExecution;
        } else {
            currentExecution = func.apply(null, args);
            currentExecution.then(reset, reset);
            return currentExecution;
        }
    };
}
