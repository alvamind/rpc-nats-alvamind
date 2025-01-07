
    export class AuthController {
        async login(credentials: {user:string, pass:string}): Promise<string> {
            if (credentials.user === 'test' && credentials.pass === 'test') return 'token';
            return 'invalid credentials';
        }

        async logout(): Promise<void> {
          return;
        }
    }
    