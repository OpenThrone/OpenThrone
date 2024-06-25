import ComposeForm from "@/components/compose-form";
import ComposeModal from "@/components/composemodal";
import { getSession } from "next-auth/react";
import Link from "next/link";
import router from "next/router";
import { useState } from "react";
import { InferGetServerSidePropsType } from "next";
import Alert from "@/components/alert";
import { getServerSideProps } from ".";

const user = ({ session }: InferGetServerSidePropsType<typeof getServerSideProps>) => {

  return (
    <>
      <Alert/>
      <h2 className="page-title">Compose </h2>
      <ComposeForm onClose={() => { router.push('/messaging/inbox') }} />
    </>
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