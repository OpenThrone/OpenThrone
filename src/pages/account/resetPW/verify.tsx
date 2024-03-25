import router from 'next/router';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { alertService } from '@/services';

const Index = () => {
  const [verify, setVerify] = useState('');
  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');

  const handleVerifySubmit = async (e) => {
    e.preventDefault(); // Prevent the default form submit action
    try {
      const response = await fetch('/api/account/verify', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verify, email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Handle successful verification
      toast.success('Verification successful!');
      setVerified(true); // Update the verified status to show the new password form
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault(); // Prevent the default form submit action for password reset
    try {
      const response = await fetch('/api/account/passChange', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword, verify, email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Handle successful password reset
      alertService.success('Password updated! Login with it now');
      setTimeout(() => {
        router.push('/account/login'); 
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
    }
  };

  if (!verified) {
    // Verification form
    return (
      <>
        <div className="mainArea pb-10">
          <h2>Password Reset</h2>
        </div>
        <div className="xs:w-96 md:w-3/4 py-2 md:col-span-9">
          <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
            <div className="flex justify-center">
              <div className="xs:w-96 md:w-3/4">
                <form onSubmit={handleVerifySubmit}>
                  <div className="mb-4">
                    <label htmlFor="email" className="mb-1 block">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2"/>
                    
                    <label htmlFor="verify" className="mb-1 block">
                      Verification code
                    </label>
                    <input
                      type="text"
                      id="verify"
                      name="verify"
                      required
                      value={verify}
                      onChange={(e) => setVerify(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Verify
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  } else {
    return (
      <>
        <div className="mainArea pb-10">
          <h2>Set New Password</h2>
        </div>
        <div className="xs:w-96 md:w-3/4 py-2 md:col-span-9">
          <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
            <div className="flex justify-center">
              <div className="xs:w-96 md:w-3/4">
                <form onSubmit={handlePasswordReset}>
                  <div className="mb-4">
                    <label htmlFor="newPassword" className="mb-1 block">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      name="newPassword"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Set New Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
};

export default Index;
