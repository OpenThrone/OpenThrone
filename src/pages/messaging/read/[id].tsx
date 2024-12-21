import { getSession } from 'next-auth/react';
import prisma from '@/lib/prisma';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { InferGetServerSidePropsType } from "next";
import MainArea from '@/components/MainArea';

const MessageDetail = ({ message }: InferGetServerSidePropsType<typeof getServerSideProps>) => {

  return (
    <MainArea title='Message Details'>
      <div>
        <h2 className="page-title text-shadow text-shadow-xs">From: {message?.from_user?.display_name ?? ''}</h2>
        <h3>To: { message?.to_user?.display_name ?? '' }</h3>
        <h3>Subject: {message.subject}</h3>
        <span>Date/Time: {message.date_time.toString()}</span>
        <br/>
        <Markdown remarkPlugins={[remarkGfm]}>{message.body}</Markdown>
      </div>
    </MainArea>
  );
};

export const getServerSideProps = async (context) => {
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

  const messageId = context.params.id;
  const message = await prisma.messages.findUnique({
    where: {
      id: parseInt(messageId, 10),
    },
    include: {
      from_user: true,
      to_user: true,
    },
  });

  if (!message) {
    return {
      notFound: true,
    };
  }

 
  return {
    props: {
      message
    },
  };
};

export default MessageDetail;
