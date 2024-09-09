import Alert from "@/components/alert";
import { useUser } from "@/context/users";
import { alertService } from "@/services";
import { Button, Grid, Space, Text, TextInput } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

const EmailVerify = (props) => {
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const {user} = useUser();

  useEffect(() => {
    // Set input from URL parameter if available
    if (searchParams.has('code')) {
      setInput(searchParams.get('code'));
    }
  }, [searchParams]);

  const onChange = (event) => {
    setInput(event.currentTarget.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    // Handle the form submission logic here
    console.log("Verification Code Submitted:", input);
    const response = await fetch('/api/account/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        verify: input,
      }),
    });
    const data = await response.json();
    if(response.ok){
      console.log("Verification Success:", data);
      alertService.success("Verification Success");
    }
    else{
      console.error("Verification Error:", data);
      alertService.error("Verification Error: " + data.error);
    }
  };

  return (
    <div className="mainArea pb-10">
      <Text
        style={{
          background: 'linear-gradient(360deg, orange, darkorange)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Email Verify - Enter Verification Code
      </Text>
      <Alert />
      <form onSubmit={handleSubmit}>
        <Grid gutter="lg">
          <Grid.Col span={6}>
            <Text>Verification Code</Text>
            <TextInput
              id="code"
              placeholder="Enter Verification Code"
              required
              name="code"
              value={input}
              onChange={onChange}
            />
            <Space h='xs' />
            <Button
              type="submit"
              size="lg"
              fullWidth
            >
              Verify
            </Button>
          </Grid.Col>
        </Grid>
      </form>
    </div>
  );
};

export default EmailVerify;
