import { useRouter } from 'next/router';
import { getSession } from 'next-auth/react';
import prisma from '@/lib/prisma';
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MessageDetail = ({ message }) => {
  const router = useRouter();

  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mx-auto w-full py-2">
      <h1 className="mb-4 text-2xl font-bold">Message Detail</h1>
      <div>
        <h2>From: {message?.from_user?.display_name ?? ''}</h2>
        <h3>To: { message?.to_user?.display_name ?? '' }</h3>
        <h3>Subject: {message.subject}</h3>
        <span>Date/Time: {message.date_time.toString()}</span>
        <br/>
        <Markdown remarkPlugins={[remarkGfm]}>{message.body}</Markdown>
      </div>
    </div>
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
