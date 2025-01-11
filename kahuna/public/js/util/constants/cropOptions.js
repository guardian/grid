// `ratioString` is sent to the server, being `undefined` for `freeform` is expected 🙈
export const landscape32 = {key: 'landscape32', ratio: 3 / 2, ratioString: '3:2', displayName: 'Landscape'};
export const landscape = {key: 'landscape', ratio: 5 / 3, ratioString: '5:3', displayName: 'Landscape'};
export const portrait = {key: 'portrait', ratio: 4 / 5, ratioString: '4:5', displayName: 'Portrait'};
export const video = {key: 'video', ratio: 16 / 9, ratioString: '16:9', displayName: 'Video'};
export const square = {key: 'square', ratio: 1, ratioString: '1:1', displayName: 'Square'};
export const freeform = {key: 'freeform', ratio: null, displayName: 'Freeform', isDefault: true};

export const cropOptions = [landscape32, landscape, portrait, video, square, freeform];
