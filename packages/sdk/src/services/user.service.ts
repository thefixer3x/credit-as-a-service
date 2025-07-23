import { HttpClient } from '../core/http-client.js';
import { 
  User, 
  UserSchema, 
  ApiResponse, 
  PaginationParams, 
  FilterParams,
  CaasValidationError 
} from '../types/index.js';

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class UserService {
  constructor(private httpClient: HttpClient) {}

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserRequest): Promise<User> {
    try {
      const response = await this.httpClient.post<User>('/users', userData);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to create user', response.error);
      }

      // Validate response data
      const user = UserSchema.parse(response.data);
      return user;
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Invalid user data format', error);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User> {
    if (!userId || typeof userId !== 'string') {
      throw new CaasValidationError('Valid user ID is required');
    }

    try {
      const response = await this.httpClient.get<User>(`/users/${userId}`);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('User not found', response.error);
      }

      return UserSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch user', error);
    }
  }

  /**
   * Update user information
   */
  async updateUser(userId: string, updates: UpdateUserRequest): Promise<User> {
    if (!userId || typeof userId !== 'string') {
      throw new CaasValidationError('Valid user ID is required');
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new CaasValidationError('Update data is required');
    }

    try {
      const response = await this.httpClient.patch<User>(`/users/${userId}`, updates);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to update user', response.error);
      }

      return UserSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to update user', error);
    }
  }

  /**
   * List users with pagination and filtering
   */
  async listUsers(
    pagination: PaginationParams = {},
    filters: FilterParams = {}
  ): Promise<UserListResponse> {
    const params = {
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc',
      ...filters,
    };

    try {
      const response = await this.httpClient.get<UserListResponse>('/users', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch users', response.error);
      }

      // Validate each user in the response
      const validatedUsers = response.data.users.map(user => UserSchema.parse(user));
      
      return {
        ...response.data,
        users: validatedUsers,
      };
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch users', error);
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User> {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new CaasValidationError('Valid email is required');
    }

    try {
      const response = await this.httpClient.get<User>('/users/by-email', {
        email,
      });
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('User not found', response.error);
      }

      return UserSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch user by email', error);
    }
  }

  /**
   * Delete user (soft delete)
   */
  async deleteUser(userId: string): Promise<boolean> {
    if (!userId || typeof userId !== 'string') {
      throw new CaasValidationError('Valid user ID is required');
    }

    try {
      const response = await this.httpClient.delete<{ deleted: boolean }>(`/users/${userId}`);
      
      return response.success && response.data?.deleted === true;
    } catch (error) {
      throw new CaasValidationError('Failed to delete user', error);
    }
  }

  /**
   * Suspend user account
   */
  async suspendUser(userId: string, reason?: string): Promise<User> {
    if (!userId || typeof userId !== 'string') {
      throw new CaasValidationError('Valid user ID is required');
    }

    try {
      const response = await this.httpClient.patch<User>(`/users/${userId}/suspend`, {
        reason,
      });
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to suspend user', response.error);
      }

      return UserSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to suspend user', error);
    }
  }

  /**
   * Reactivate suspended user
   */
  async reactivateUser(userId: string): Promise<User> {
    if (!userId || typeof userId !== 'string') {
      throw new CaasValidationError('Valid user ID is required');
    }

    try {
      const response = await this.httpClient.patch<User>(`/users/${userId}/reactivate`);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to reactivate user', response.error);
      }

      return UserSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to reactivate user', error);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalLoans: number;
    activeLoans: number;
    totalBorrowed: number;
    totalPaid: number;
    creditScore?: number;
    accountAge: number;
  }> {
    if (!userId || typeof userId !== 'string') {
      throw new CaasValidationError('Valid user ID is required');
    }

    try {
      const response = await this.httpClient.get<any>(`/users/${userId}/stats`);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch user statistics', response.error);
      }

      return response.data;
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch user statistics', error);
    }
  }

  /**
   * Search users by query
   */
  async searchUsers(
    query: string,
    pagination: PaginationParams = {}
  ): Promise<UserListResponse> {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new CaasValidationError('Search query is required');
    }

    const params = {
      q: query.trim(),
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc',
    };

    try {
      const response = await this.httpClient.get<UserListResponse>('/users/search', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to search users', response.error);
      }

      // Validate each user in the response
      const validatedUsers = response.data.users.map(user => UserSchema.parse(user));
      
      return {
        ...response.data,
        users: validatedUsers,
      };
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to search users', error);
    }
  }
}