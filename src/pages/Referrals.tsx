import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Users, DollarSign, UserPlus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Referrals() {
  const { user } = useAuth();

  const referralLink = user
    ? `${window.location.origin}/auth?ref=${user.id}`
    : '';

  const { data: referrals = [] } = useQuery({
    queryKey: ['affiliate-referrals', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('affiliate_referrals')
        .select('*')
        .eq('referrer_id', user!.id)
        .order('signup_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ['affiliate-commissions', user?.id],
    queryFn: async () => {
      if (!referrals.length) return [];
      const refIds = referrals.map((r) => r.id);
      const { data, error } = await supabase
        .from('affiliate_commissions')
        .select('*')
        .in('referral_id', refIds)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: referrals.length > 0,
  });

  const totalEarned = commissions.reduce((sum, c) => sum + c.amount, 0);
  const pendingAmount = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  const paidAmount = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied!');
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Referral Program</h1>
          <p className="text-muted-foreground mt-1">
            Earn 30% commission on every purchase your referrals make for 12 months
          </p>
        </div>

        {/* Referral Link */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Referral Link</CardTitle>
            <CardDescription>Share this link to start earning commissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <input
                readOnly
                value={referralLink}
                className="flex-1 text-sm bg-muted rounded-md px-3 py-2 text-muted-foreground select-all border border-border"
              />
              <Button size="sm" onClick={copyLink} className="shrink-0">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={UserPlus} label="Signups" value={String(referrals.length)} />
          <StatCard icon={Users} label="Converted" value={String(referrals.filter((r) => r.first_purchase_at).length)} />
          <StatCard icon={DollarSign} label="Total Earned" value={`$${totalEarned.toFixed(2)}`} />
          <StatCard icon={CheckCircle2} label="Pending" value={`$${pendingAmount.toFixed(2)}`} sub={`$${paidAmount.toFixed(2)} paid`} />
        </div>

        {/* Referral History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referral History</CardTitle>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No referrals yet. Share your link to get started!
              </p>
            ) : (
              <div className="space-y-2">
                {referrals.map((ref) => (
                  <div key={ref.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">
                        Referral #{ref.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Signed up {format(new Date(ref.signup_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Badge variant={ref.first_purchase_at ? 'default' : 'secondary'}>
                      {ref.first_purchase_at ? 'Converted' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
