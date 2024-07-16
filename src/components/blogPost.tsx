import { Divider, Flex, Paper, Space, Title, Text, Checkbox, Badge } from "@mantine/core";
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const BlogPost = ({ post, loggedIn, handleReadChange }) => {
  return (
    <><div key={post.id} className="mx-auto rounded-xl overflow-hidden border border-gray-200">
      <Paper shadow='lg'>
        <Flex justify="space-between" className="items-center p-4">
        <Title size={'md'} ff={'heading'} c={'gray'} className="uppercase tracking-wide font-semibold">
          {post.title}
          <br /><span className="text-xs">{new Date(post.created_timestamp).toLocaleString()}</span>
        </Title>
        <Divider m={'md'} c='dimmed' size={'xl'} />
        {loggedIn && (
            <Badge color='brand'>
              <Checkbox labelPosition='left' defaultChecked={post.isRead} onChange={handleReadChange} label="Read" />
            </Badge>
        )}
      </Flex>
      </Paper>
      <Paper className="p-4" bg={'dark'}>
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="text-gray-400">{post.content}</Markdown>
      </Paper>
    </div>
    
      <Space h='lg' /></>
  );
}

export default BlogPost;
