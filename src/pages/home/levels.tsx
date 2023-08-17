const Levels = () => {
  // const router = useRouter();

  return (
    <div className="mainArea pb-10">
      <h2>Levels</h2>
      <div className="flex flex-col items-center">
        <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
          <div className="border-b-2 border-yellow-200 px-6 py-3 ">
            Strength (Offense)
          </div>
          <div className="p-6">
            <p className="mb-4 text-base  dark:text-neutral-200">
              Current Bonus 0%
            </p>
            <button
              type="button"
              className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
              data-te-ripple-init
              data-te-ripple-color="light"
            >
              Add
            </button>
          </div>
        </div>
        <div className="flex justify-between">
          <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
            <div className="border-b-2 border-yellow-200 px-6 py-3 ">
              Constitution (Defense)
            </div>
            <div className="p-6">
              <p className="mb-4 text-base  dark:text-neutral-200">
                Current Bonus 0%
              </p>
              <button
                type="button"
                className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                data-te-ripple-init
                data-te-ripple-color="light"
              >
                Add
              </button>
            </div>
          </div>

          <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
            <div className="border-b-2 border-yellow-200 px-6 py-3 ">
              Wealth (Income)
            </div>
            <div className="p-6">
              <p className="mb-4 text-base  dark:text-neutral-200">
                Current Bonus 0%
              </p>
              <button
                type="button"
                className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                data-te-ripple-init
                data-te-ripple-color="light"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <div className="flex justify-start">
            <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
              <div className="border-b-2 border-yellow-200 px-6 py-3 ">
                Dexterity (Spy & Sentry)
              </div>
              <div className="p-6">
                <p className="mb-4 text-base  dark:text-neutral-200">
                  Current Bonus 0%
                </p>
                <button
                  type="button"
                  className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                  data-te-ripple-init
                  data-te-ripple-color="light"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="block rounded-lg border border-yellow-400 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] dark:bg-neutral-700">
              <div className="border-b-2 border-yellow-200 px-6 py-3 ">
                Charisma (Reduced Prices)
              </div>
              <div className="p-6">
                <p className="mb-4 text-base  dark:text-neutral-200">
                  Current Bonus 0%
                </p>
                <button
                  type="button"
                  className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                  data-te-ripple-init
                  data-te-ripple-color="light"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Levels;
