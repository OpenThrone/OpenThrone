import prisma from "@/lib/prisma";
import ComposeModal from "@/components/composemodal";
import { getSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

const Compose = ({ messages, session }) => {

  return (
    <ComposeModal onClose={() => { }} />
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

  // Fetch messages for the logged-in user, including the from_user relation
  const messages = await prisma.messages.findMany({
    where: {
      to_user_id: session.user.id,
    },
    include: {
      from_user: true,  // Include the from_user relation
    },
  });

  return {
    props: {
      messages,
      session,
    },
  };
}

export default Compose;