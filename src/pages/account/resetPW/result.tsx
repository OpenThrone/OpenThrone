const result = () => {
  return (
    <>
      <div className="mainArea pb-10">
        <h2>Password Reset Results</h2>
      </div>
      <div className="mx-auto w-3/4 py-2 md:col-span-9">
        <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">

          <div className="flex justify-center">
            <div className="w-3/4">
              <p>If an account is attached to this email, then you&apos;ll receive an email with the password link. This link is good for 24hours.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default result;