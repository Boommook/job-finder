import{AuthForm}from"@/components/auth-form";import{signUp}from"@/app/auth-actions";
export default async function SignupPage({searchParams}:{searchParams:Promise<{error?:string}>}){const{error}=await searchParams;return <AuthForm mode="signup" action={signUp} error={error}/>}
