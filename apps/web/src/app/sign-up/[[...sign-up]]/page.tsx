import { SignUp } from '@clerk/nextjs';
import { AuthFrame } from '@/components/auth-frame';

export default function SignUpPage() {
  return (
    <AuthFrame>
      <SignUp />
    </AuthFrame>
  );
}
