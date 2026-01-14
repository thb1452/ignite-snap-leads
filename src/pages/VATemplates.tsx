import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Copy, FileText, CheckCircle } from 'lucide-react';
import { useFoiaTemplates, useIncrementTemplateUse, FoiaTemplate } from '@/hooks/useFoiaTemplates';

const US_STATES: Record<string, string> = {
  OH: 'Ohio',
  TX: 'Texas',
  FL: 'Florida',
  CA: 'California',
  NY: 'New York',
  // Add more as needed
};

export default function VATemplates() {
  const { data: templates, isLoading } = useFoiaTemplates();
  const incrementUse = useIncrementTemplateUse();
  const [selectedTemplate, setSelectedTemplate] = useState<FoiaTemplate | null>(null);
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    if (!selectedTemplate) return;
    
    await navigator.clipboard.writeText(selectedTemplate.template_text);
    incrementUse.mutate(selectedTemplate.id);
    setCopied(true);
    
    setTimeout(() => {
      setCopied(false);
      setSelectedTemplate(null);
    }, 1500);
  };
  
  // Group templates
  const genericTemplates = templates?.filter(t => !t.state) || [];
  const stateTemplates = templates?.filter(t => t.state) || [];
  
  // Group state templates by state
  const stateGroups = stateTemplates.reduce((acc, t) => {
    const state = t.state || 'Other';
    if (!acc[state]) acc[state] = [];
    acc[state].push(t);
    return acc;
  }, {} as Record<string, FoiaTemplate[]>);
  
  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
        <Button variant="ghost" asChild className="mb-2">
          <Link to="/va-workspace">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Workspace
          </Link>
        </Button>
        
        <PageHeader 
          title="FOIA Request Templates" 
          description="Copy and paste these templates to save time"
        />
        
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : (
          <>
            {/* Generic Templates */}
            <section>
              <h2 className="text-lg font-semibold mb-4">General Templates</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {genericTemplates.map(template => (
                  <TemplateCard 
                    key={template.id} 
                    template={template} 
                    onSelect={() => setSelectedTemplate(template)} 
                  />
                ))}
              </div>
            </section>
            
            {/* State-Specific Templates */}
            {Object.keys(stateGroups).length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4">State-Specific Templates</h2>
                {Object.entries(stateGroups).map(([state, stateTemps]) => (
                  <div key={state} className="mb-6">
                    <h3 className="text-md font-medium text-muted-foreground mb-3">
                      {US_STATES[state] || state}
                    </h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stateTemps.map(template => (
                        <TemplateCard 
                          key={template.id} 
                          template={template} 
                          onSelect={() => setSelectedTemplate(template)} 
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        
        {/* Template Modal */}
        <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {selectedTemplate?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {selectedTemplate?.state && (
                <Badge className="mb-4">{US_STATES[selectedTemplate.state] || selectedTemplate.state} Template</Badge>
              )}
              <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm leading-relaxed">
                {selectedTemplate?.template_text}
              </div>
              <Button 
                onClick={handleCopy} 
                size="lg" 
                className="w-full mt-4"
                disabled={copied}
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function TemplateCard({ 
  template, 
  onSelect 
}: { 
  template: FoiaTemplate; 
  onSelect: () => void;
}) {
  const preview = template.template_text.slice(0, 150) + (template.template_text.length > 150 ? '...' : '');
  
  return (
    <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={onSelect}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{template.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{preview}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Used {template.use_count || 0} times</span>
          {template.state && (
            <Badge variant="outline" className="text-xs">{template.state}</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full mt-3">
          <Copy className="h-3 w-3 mr-2" />
          View & Copy
        </Button>
      </CardContent>
    </Card>
  );
}
