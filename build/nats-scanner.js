import { getAllInterfaceMethods } from "./utils";
export function generateNatsSubject(className, methodName, pattern) {
    return pattern(className, methodName);
}
export function getAllControllerMethods(instance, pattern) {
    const methods = getAllInterfaceMethods(instance.constructor);
    return methods.map((method) => ({
        ...method,
        subject: generateNatsSubject(instance.constructor.name, method.key, pattern)
    }));
}
//# sourceMappingURL=nats-scanner.js.map