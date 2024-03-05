/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { setTimeout } from 'timers';

import LoadingDots from '@/components/loading-dots';

const Form = ({
  type,
  setErrorMessage,
}: {
  type: string;
  setErrorMessage: (msg: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    display_name: '',
    email: '',
    password: '',
    race: 'HUMAN',
    class: 'FIGHTER',
  });

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          if (type === 'login') {
            const res = await signIn('credentials', {
              redirect: false,
              email: e.currentTarget.email.value,
              password: e.currentTarget.password.value,
            });
            if (res?.ok) {
              setLoading(false);
              router.push('/home/overview');
            } else {
              setLoading(false);
              setErrorMessage(res?.error ?? 'Something went wrong!');
            }
          } else {
            const res = await fetch('/api/auth/register/route', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(formData),
            });

            if (res.status === 200) {
              toast.success('Account created! Redirecting to login...');
              setTimeout(() => {
                router.push('/account/login');
              }, 2000);
            } else {
              const message = await res.json();
              setLoading(false);
              setErrorMessage(message.error);
            }
          }
        } catch (error) {
          console.error(error);
          setErrorMessage('Something went wrong!');
          setLoading(false);
        }
      }}
      className="mt-2 flex flex-col space-y-4"
    >
      {type === 'login' ? (
        <>
          <div className="mb-3">
            <label htmlFor="email" className="mb-1 block">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="username@email.com"
              autoComplete="email"
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
        </>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor="display_name" className="from-label mb-1 block">
              User Name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              placeholder="DisplayName"
              autoComplete="display_name"
              onKeyUp={handleKeyUp}
              onChange={handleChange}
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="email" className="mb-1 block">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="username@email.com"
              autoComplete="email"
              onKeyUp={handleKeyUp}
              onChange={handleChange}
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              onKeyUp={handleKeyUp}
              onChange={handleChange}
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="race" className="mb-1 block">
              Race
            </label>
            <select
              className="form-select w-full rounded border border-gray-300 px-3 py-2"
              id="race"
              name="race"
              value={formData.race}
              onChange={handleChange}
            >
              <option value="HUMAN">HUMAN</option>
              <option value="UNDEAD">UNDEAD</option>
              <option value="GOBLIN">GOBLIN</option>
              <option value="ELF">ELF</option>
            </select>
          </div>
          <div className="mb-3">
            <label htmlFor="class" className="mb-1 block">
              Class
            </label>
            <select
              className="form-select w-full rounded border border-gray-300 px-3 py-2"
              id="class"
              name="class"
              value={formData.class}
              onChange={handleChange}
            >
              <option value="FIGHTER">FIGHTER</option>
              <option value="CLERIC">CLERIC</option>
              <option value="ASSASSIN">ASSASSIN</option>
              <option value="THIEF">THIEF</option>
            </select>
          </div>
        </>
      )}
      <button
        disabled={loading}
        type="submit"
        className={`${
          loading
            ? 'cursor-not-allowed border-gray-200 bg-gray-100'
            : 'border-black bg-black text-white hover:bg-white hover:text-black'
        } flex h-10 w-full items-center justify-center rounded-md border text-sm transition-all focus:outline-none`}
      >
        {loading ? (
          <LoadingDots color="#808080" />
        ) : (
          <p>{type === 'login' ? 'Sign In' : 'Sign Up'}</p>
        )}
      </button>
      {type === 'login' ? (
        <p className="text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link
            href="/account/register"
            className="font-semibold text-gray-800"
          >
            Sign up
          </Link>{' '}
          for free.
        </p>
      ) : (
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/account/login" className="font-semibold text-gray-800">
            Sign in
          </Link>{' '}
          instead.
        </p>
      )}
    </form>
  );
};

export default Form;
