export function contactTemplatePayload(to: string, customerName: string, topic: string, templateName: string, language = "es_CO") {
  const name = customerName.trim().slice(0, 80);
  const subject = topic.trim().slice(0, 120);
  if (!/^57[3]\d{9}$/.test(to) || !name || subject.length < 2 || !/^[a-z0-9_]{3,512}$/.test(templateName) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error("invalid_whatsapp_template");
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [{ type: "body", parameters: [
        { type: "text", parameter_name: "nombre", text: name },
        { type: "text", parameter_name: "consulta", text: subject },
      ] }],
    },
  };
}
