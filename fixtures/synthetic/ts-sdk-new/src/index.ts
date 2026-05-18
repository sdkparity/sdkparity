export type User = {
  id: string;
  email: string;
};

export type ListUsersOptions = {
  limit?: number;
};

export type CreateUserOptions = {
  email: string;
};

export class Client {
  constructor(private readonly apiKey: string) {}

  async listUsers(options: ListUsersOptions = {}): Promise<User[]> {
    void options;
    return [];
  }

  async getUser(userId: string): Promise<User> {
    return { id: userId, email: "person@example.com" };
  }

  async createUser(options: CreateUserOptions): Promise<User> {
    return { id: "usr_123", email: options.email };
  }
}
