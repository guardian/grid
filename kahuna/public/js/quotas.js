const mediaApiUri = document.querySelector('link[rel="media-api-uri"').href;
const usageUri = mediaApiUri + '/usage/quotas';

const show = (content) => {
    document.getElementById("root").innerHTML = content;
};

const renderSupplier = (name, entry) => {
    const usage = entry.usage ? entry.usage.count : "unknown";
    const quota = entry.quota ? entry.quota.count : "unknown";

    const warning = `– <span style="color: red"> quota exceeded</span>`;
    const encouragement = `- <span style="color: green"> quota not full</span>`;
    const meter = `<meter low="${quota - 2}" high="${quota - 1}" max="${quota}" value=${usage}>B</meter>`;

    return `
        <tr>
            <th colspan="3">
                <h3>${name}  ${entry.exceeded ? warning : encouragement}</h3>
            </th>
        </tr>
        <tr>
            <td>
                Usages:
            </td>
            <td>
                ${usage}/${quota}
            </td>
            <td>
                ${(typeof quota === "number" && typeof usage === "number") ? meter : ""}
            </td>
        </tr>
    `;
};

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
