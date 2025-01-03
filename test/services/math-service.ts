interface User {
  id: number;
  name: string;
  email: string;
}
interface Product {
  id: number;
  name: string;
  price: number;
}
export class MathService {
  async add(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing add request: ', data);
    return { result: data.a + data.b };
  }
  async subtract(data: { a: number; b: number }): Promise<{ result: number }> {
    console.log('Processing subtract request: ', data);
    return { result: data.a - data.b };
  }
  async getUser(id: number): Promise<User> {
    console.log('Processing get user request: ', id);
    return {
      id,
      name: 'John Doe',
      email: 'john.doe@example.com',
    };
  }
  async getProduct(id: number): Promise<Product> {
    console.log('Processing get product request: ', id);
    return {
      id,
      name: 'Laptop',
      price: 1200,
    };
  }
}
