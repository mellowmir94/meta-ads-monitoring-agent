type LogContext = Record<string, string | number | boolean | null | undefined>;

function cleanContext(context?: LogContext) {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).filter(([key, value]) => {
      const lowerKey = key.toLowerCase();
      return value !== undefined && !lowerKey.includes("token") && !lowerKey.includes("secret");
    })
  );
}

export const metaAdsLogger = {
  info(message: string, context?: LogContext) {
    console.info(JSON.stringify({ level: "info", message, context: cleanContext(context) }));
  },
  warn(message: string, context?: LogContext) {
    console.warn(JSON.stringify({ level: "warn", message, context: cleanContext(context) }));
  },
  error(message: string, context?: LogContext) {
    console.error(JSON.stringify({ level: "error", message, context: cleanContext(context) }));
  }
};
