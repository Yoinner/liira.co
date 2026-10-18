const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
};

export function amandaPhoneAllowed(phone: string, enabled: string | undefined, mode: string | undefined, allowlist: string | undefined) {
  if (enabled !== "true") return false;
  if (mode === "all") return true;
  const normalized = normalizePhone(phone);
  return Boolean(normalized && allowlist?.split(",").some((item) => normalizePhone(item.trim()) === normalized));
}

export function amandaEnabledForPhone(phone: string) {
  return amandaPhoneAllowed(phone, process.env.AMANDA_ENABLED, process.env.AMANDA_ROLLOUT_MODE, process.env.AMANDA_TEST_PHONE_ALLOWLIST);
}
