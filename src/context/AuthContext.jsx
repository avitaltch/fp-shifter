import { createContext, useContext } from 'react';

export const AuthContext = createContext({
  session: null,
  profile: null,
  role: null,
  loading: true,
  profileError: false,
  accountDisabled: false,
  retryProfile: () => {},
  signIn: async () => {},
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
