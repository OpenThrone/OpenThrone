import ComposeForm from "@/components/compose-form";
import { getSession } from "next-auth/react";
import router from "next/router";
import { InferGetServerSidePropsType } from "next";
import MainArea from "@/components/MainArea";

const user = ({ session }: InferGetServerSidePropsType<typeof getServerSideProps>) => {

  return (
    <MainArea title="Compose Message">
      <ComposeForm onClose={() => { router.push('/messaging/inbox') }} />
    </MainArea>
  );
};


export const getServerSideProps = async (context: any) => {
  const session = await getSession(context);

  if (!session) {
    // If no user is authenticated, redirect to the login page
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  

  return {
    props: {
      session,
    },
  };
}

export default user;