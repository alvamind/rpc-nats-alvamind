
    import { User } from '../../models/user.model';
    import { Logger } from '../logger';

    export class UserController {
        constructor(private logger: Logger) {}

        async getUser(id: number): Promise<User> {
           this.logger.log('Getting user:'+ id)
            return { id, name: 'Test User' };
        }

        async createUser(user: User): Promise<User> {
             this.logger.log('Creating user:'+ user.name);
            return user;
        }
    }
    