import prisma from "@/lib/prisma";
import ComposeModal from "@/components/composemodal";
import { getSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { InferGetServerSidePropsType } from "next";
import router from "next/router";

const Compose = ({ session }: InferGetServerSidePropsType<typeof getServerSideProps>) => {

  return (
    <ComposeModal onClose={() => { router.push('/messaging/inbox') }} />
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

export default Compose;