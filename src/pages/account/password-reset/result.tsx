import MainArea from '@/components/MainArea';
import MainArea from '@/components/MainArea';
import { Container, Title, Paper, Text } from '@mantine/core';

const Result = (props) => {
  return (
    <MainArea title="Password Reset">
      <Container size="xs" className="py-2 md:col-span-9">
        <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg" style={{ backgroundColor: '#b5a565' }}>
          <div className="flex justify-center">
            <div className="xs:w-96 md:w-3/4">
              <Text>If an account is attached to this email, then you&apos;ll receive an email with the password link. This link is good for 24 hours.</Text>
            </div>
          </div>
        </Paper>
      </Container>
    </MainArea>
  );
}

export default Result;
