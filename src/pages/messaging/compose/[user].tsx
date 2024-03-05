import ComposeForm from "@/components/compose-form";
import ComposeModal from "@/components/composemodal";
import { getSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

const user = ({ session }) => {

  return (
    <>
      <h2>Compose </h2>
      <ComposeForm onClose={() => { }} />
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