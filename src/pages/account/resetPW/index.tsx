import { TextInput } from '@mantine/core';
import router from 'next/router';
import { useState } from 'react';
import toast from 'react-hot-toast';
import classes from './floatinginput.module.css';

const Index = () => {
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const floating = email.trim().length !== 0 || focused || undefined;

  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent the default form submit action
    try {
      const response = await fetch('/api/account/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }
      // Handle success
      toast.success('Account created! Redirecting to login...');
      setTimeout(() => {
        router.push('/account/resetPW/result');
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      alert(error.message);
    }
  };

  return (
    <>
      <div className="mainArea pb-10">
        <h2>Password Reset</h2>
      </div>
      <div className="mx-auto xs:w-96 md:w-3/4 py-2 md:col-span-9">
        <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
          <div className="flex justify-center">
            <div className="xs:w-96 md:w-3/4">
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <TextInput
                    label="Email Address"
                    placeholder="Enter your email address"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    classNames={classes}
                    mt="md"
                    autoComplete="nope"
                    data-floating={floating}
                    labelProps={{ 'data-floating': floating }}
                    className="w-full rounded border border-gray-300"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Index;
