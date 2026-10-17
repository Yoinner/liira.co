export const MAX_OUTBOUND_MEDIA_BYTES = 4 * 1024 * 1024;

const formats = {
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/png": { kind: "image", extension: "png" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "video/3gpp": { kind: "video", extension: "3gp" },
} as const;

export type OutboundMediaType = keyof typeof formats;

export function inspectOutboundMedia(bytes: Uint8Array, declaredType: string) {
  const format = formats[declaredType as OutboundMediaType];
  if (!format || !bytes.length || bytes.length > MAX_OUTBOUND_MEDIA_BYTES) throw new Error("invalid_whatsapp_media");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isoVideo = bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if ((declaredType === "image/jpeg" && !jpeg) || (declaredType === "image/png" && !png) || (format.kind === "video" && !isoVideo)) throw new Error("invalid_whatsapp_media");
  return { ...format, mimeType: declaredType as OutboundMediaType };
}

export function mediaMessagePayload(to: string, kind: "image" | "video", mediaId: string, caption?: string | null) {
  if (!/^\d{10,15}$/.test(to) || !/^[A-Za-z0-9_-]{6,200}$/.test(mediaId)) throw new Error("invalid_whatsapp_media_message");
  const media = { id: mediaId, ...(caption?.trim() ? { caption: caption.trim().slice(0, 1024) } : {}) };
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: kind, [kind]: media };
}
