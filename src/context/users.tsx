import { useRouter } from "next/router";
import {  useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useMemo } from "react";

import UserModel from "@/models/Users";

const UserContext = createContext(null);

export const useUser = () => useContext(UserContext);

const publicPathsRegex = [
  /^\/account\/login$/,
  /^\/account\/register$/,
  /^\/$/,
  /^\/userprofile\/\d+$/,
];

const isPublicPath = (path) =>
  publicPathsRegex.some((regex) => regex.test(path));

export const UserProvider: React.FC = ({ children }) => {
  const router = useRouter();
  const { data, status} = useSession();

  useEffect(() => {
    const { asPath } = router;

    if (!(status === "loading")) {
      if (!data && !isPublicPath(asPath)) {
        router.replace("/account/login");
      } else if (data && asPath === "/") {
        router.replace("/home/overview");
      }
    }
  }, [data, router, status]);


  const player = useMemo(() => {
    const _user = new UserModel(data?.player);

    return { user: _user, loading: status === "loading", userSession: data };
  }, [data, status]);

  return <UserContext.Provider value={player}>{children}</UserContext.Provider>;
};
