const mediaApiUri = document.querySelector('link[rel="media-api-uri"').href;
const usageUri = mediaApiUri + 'usage/quotas';

function show(content) {
    document.getElementById("root").innerHTML = content;
}

function renderSupplier(name, entry) {
    const colour = entry.exceeded ? "red" : "green";

    const usage = entry.usage ? entry.usage.count : "unknown";
    const quota = entry.quota ? entry.quota.count : "unknown";

    return `
        <li>
            <h3 style="background-color: ${colour}">${name}</h3>
            <small>
                ${usage}/${quota}
            </small>
        </li>
    `;
}

fetch(usageUri, { credentials: "include" })
    .then(r => r.json())
    .then(r => r.data.store)
    .then(r => {
        const entries = Object.keys(r).map(name => renderSupplier(name, r[name]));
        show(`<ul>${entries.join("\n")}</ul>`);
    }).catch(err => {
        console.log(err);
        show("Error getting quotas. Are you logged in?");
    });
