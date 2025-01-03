// utils.ts
/**
 * Generate NATS subject based on class name, method name, and pattern
 * @param className
 * @param methodName
 * @param pattern
 * @returns string
 */
export function generateNatsSubject(
  className: string,
  methodName: string,
  pattern: (className: string, methodName: string) => string,
): string {
  return pattern(className, methodName);
}
