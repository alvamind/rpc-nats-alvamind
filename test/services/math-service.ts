// A simple service class
export class MathService {
  async add(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing add request: ', data);
    return { result: data.a + data.b };
  }

  async subtract(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing subtract request: ', data);
    return { result: data.a - data.b };
  }
}
