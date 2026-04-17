import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { SCHOOL_NAME, APP_NAME, SCHOOL_DOMAIN } from '../constants';
import { GraduationCap, Users, UserCog, Lock, Mail, Hash } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Login() {
  const [activeTab, setActiveTab] = useState<'student-parent' | 'staff'>('student-parent');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let email = identifier.toLowerCase();
      
      if (activeTab === 'student-parent') {
        // Handle school number login
        // For students: 1234567 -> 1234567@eldenheights.org
        // For parents: p1234567 -> p1234567@eldenheights.org
        email = `${email}@${SCHOOL_DOMAIN}`;
      }

      await signInWithEmailAndPassword(auth, email, password);
      // App.tsx will handle redirection based on role
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in the Firebase Console. Please enable it under Authentication > Sign-in method.');
      } else if (err.code === 'auth/invalid-email') {
        setError('The email address is badly formatted. Please check your credentials.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Invalid school number or password. Please check your credentials.');
      } else {
        setError('Login failed: ' + (err.message || 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError('Google login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-900 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-8 text-center bg-gray-50 border-b">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <GraduationCap className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="text-gray-500 text-sm mt-1">{SCHOOL_NAME} ERP</p>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('student-parent')}
            className={cn(
              "flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2",
              activeTab === 'student-parent' ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Users className="w-4 h-4" />
            Student / Parent
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={cn(
              "flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2",
              activeTab === 'staff' ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <UserCog className="w-4 h-4" />
            Staff Portal
          </button>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {activeTab === 'student-parent' ? 'School Number' : 'Email Address'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  {activeTab === 'student-parent' ? <Hash className="h-5 w-5 text-gray-400" /> : <Mail className="h-5 w-5 text-gray-400" />}
                </div>
                <input
                  type={activeTab === 'student-parent' ? 'text' : 'email'}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={activeTab === 'student-parent' ? 'e.g. 1234567 or p1234567' : 'name@example.com'}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <h4 className="text-xs font-bold text-blue-800 uppercase tracking-widest mb-2">Demo Credentials</h4>
            <div className="space-y-2 text-[11px] text-blue-700">
              <p>• <span className="font-bold">Super Admin:</span> Use your Google account (imagicityart@gmail.com)</p>
              <p>• <span className="font-bold">Others:</span> Create them in the Admin Portal. Default password is <span className="font-bold underline">password123</span></p>
              <p>• <span className="font-bold">Students:</span> Login with School Number (e.g. 1234567)</p>
              <p>• <span className="font-bold">Parents:</span> Login with p + School Number (e.g. p1234567)</p>
            </div>
          </div>

          {activeTab === 'staff' && (
            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or continue with</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg shadow-sm transition-all"
              >
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                Google Account
              </button>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 border-t text-center">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} {SCHOOL_NAME}. All rights reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
