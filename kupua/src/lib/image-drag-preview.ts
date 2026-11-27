export function setImageDragPreview(transfer: DataTransfer, source: Element, ids: readonly string[] = []) {
  if (typeof transfer.setDragImage !== "function") return;
  const loadedImage = (element: Element) => {
    const image = element instanceof HTMLImageElement ? element : element.querySelector("img");
    return image?.complete && image.naturalWidth > 0 ? image : undefined;
  };
  const front = loadedImage(source);
  const layers = front ? [front] : [];
  if (ids.length > 1) {
    const selected = new Set(ids);
    for (const cell of source.closest('[role="region"], [role="table"]')?.querySelectorAll("[data-cell-id]") ?? []) {
      if (!selected.has(cell.getAttribute("data-cell-id") ?? "")) continue;
      const image = loadedImage(cell);
      if (image && !layers.includes(image)) layers.push(image);
      if (layers.length === 3) break;
    }
    while (front && layers.length < Math.min(3, ids.length)) layers.push(front);
  }
  if (!layers.length) return;
  const canvas = document.createElement("canvas");
  canvas.width = 101;
  canvas.height = 82;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(1.2, 1.2);
  layers.reverse().forEach((image, index) => {
    const scale = Math.min(58 / image.naturalWidth, 48 / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.save();
    context.translate(36 + index * 3, 32 + index);
    context.rotate((index + 1 - layers.length) * 0.12);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.strokeStyle = "rgba(152,152,152,.8)";
    context.strokeRect(-width / 2, -height / 2, width, height);
    context.restore();
  });
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = "rgba(0,0,0,.7)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  if (ids.length > 1) {
    context.font = "bold 12px sans-serif";
    const count = String(ids.length), width = Math.ceil(context.measureText(count).width) + 10;
    context.fillStyle = "rgba(24,24,24,.9)";
    context.beginPath(); context.roundRect(82 - width, 46, width, 18, 8); context.fill();
    context.fillStyle = "white"; context.textAlign = "center"; context.fillText(count, 82 - width / 2, 59);
  }
  canvas.style.cssText = "position:fixed;left:-100px;top:0;pointer-events:none";
  document.body.append(canvas);
  transfer.setDragImage(canvas, 12, 10);
  requestAnimationFrame(() => canvas.remove());
}