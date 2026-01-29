import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Key, Loader2, Check } from 'lucide-react';
import { useProfileSettings } from '@/hooks/useProfileSettings';
import { Skeleton } from '@/components/ui/skeleton';

export function AccountDetailsSection() {
  const { profile, isLoading, updateProfile, requestPasswordReset } = useProfileSettings();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const handleEditName = () => {
    setNewName(profile?.full_name || '');
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (newName.trim()) {
      updateProfile.mutate({ full_name: newName.trim() });
    }
    setIsEditingName(false);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNewName('');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Account Details
        </CardTitle>
        <CardDescription>
          Manage your personal account information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email
          </Label>
          <div className="flex items-center gap-2">
            <p className="flex-1 px-3 py-2 bg-muted rounded-md text-sm">
              {profile?.email || 'Not available'}
            </p>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Check className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          </div>
        </div>

        {/* Full Name */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Full Name</Label>
          {isEditingName ? (
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter your name"
                className="flex-1"
              />
              <Button 
                size="sm" 
                onClick={handleSaveName}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="flex-1 px-3 py-2 bg-muted rounded-md text-sm">
                {profile?.full_name || 'Not set'}
              </p>
              <Button variant="ghost" size="sm" onClick={handleEditName}>
                Edit
              </Button>
            </div>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Key className="h-4 w-4 text-muted-foreground" />
            Password
          </Label>
          <div className="flex items-center gap-2">
            <p className="flex-1 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
              ••••••••••••
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => requestPasswordReset.mutate()}
              disabled={requestPasswordReset.isPending}
            >
              {requestPasswordReset.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </div>
        </div>

        {/* Member Since */}
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Member since {profile?.created_at 
              ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) 
              : 'Unknown'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
