import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Package, AlertTriangle, CheckCircle, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/use-profile';

interface Material {
  id: string;
  name: string;
  description: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  warehouse_stock: number;
  on_site_stock: number;
  reorder_point: number;
  supplier: string;
  category: string;
}

interface JobMaterial {
  id: string;
  job_id: number;
  material_id: string;
  quantity_allocated: number;
  quantity_used: number;
  location: string;
  date_assigned: string;
  notes: string;
  material?: Material;
}

export function Materials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [jobMaterials, setJobMaterials] = useState<JobMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();
  const { profile } = useProfile();

  const [newMaterial, setNewMaterial] = useState({
    name: '',
    description: '',
    unit: 'piece',
    cost_per_unit: 0,
    current_stock: 0,
    warehouse_stock: 0,
    on_site_stock: 0,
    reorder_point: 10,
    supplier: '',
    category: 'general'
  });

  useEffect(() => {
    fetchMaterials();
    fetchJobMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading materials",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchJobMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('job_materials')
        .select(`
          *,
          material:materials(*)
        `)
        .order('date_assigned', { ascending: false });

      if (error) throw error;
      setJobMaterials(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading job materials",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterial = async () => {
    if (!profile?.org_id) return;

    try {
      const { error } = await supabase
        .from('materials')
        .insert([{
          ...newMaterial,
          org_id: profile.org_id
        }]);

      if (error) throw error;

      toast({
        title: "Material added successfully",
        description: `${newMaterial.name} has been added to your inventory`,
      });

      setIsAddDialogOpen(false);
      setNewMaterial({
        name: '',
        description: '',
        unit: 'piece',
        cost_per_unit: 0,
        current_stock: 0,
        warehouse_stock: 0,
        on_site_stock: 0,
        reorder_point: 10,
        supplier: '',
        category: 'general'
      });
      fetchMaterials();
    } catch (error: any) {
      toast({
        title: "Error adding material",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStockStatus = (material: Material) => {
    if (material.current_stock <= material.reorder_point) {
      return { status: 'low', color: 'destructive' as const, icon: AlertTriangle };
    }
    if (material.current_stock <= material.reorder_point * 2) {
      return { status: 'medium', color: 'default' as const, icon: Minus };
    }
    return { status: 'good', color: 'default' as const, icon: CheckCircle };
  };

  const categories = ['general', 'lumber', 'electrical', 'plumbing', 'hardware'];
  const units = ['piece', 'linear ft', 'sq ft', 'box', 'gallon', 'pound'];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Materials Management</h1>
          <p className="text-muted-foreground mt-2">Loading materials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Materials Management</h1>
          <p className="text-muted-foreground mt-2">
            Track inventory, assign materials to jobs, and manage purchase orders
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Add Material</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Material</DialogTitle>
              <DialogDescription>
                Add a new material to your inventory
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Material Name</Label>
                <Input
                  id="name"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. 2x4 Lumber"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Material description..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Select value={newMaterial.unit} onValueChange={(value) => setNewMaterial(prev => ({ ...prev, unit: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(unit => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={newMaterial.category} onValueChange={(value) => setNewMaterial(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cost">Cost per Unit ($)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    value={newMaterial.cost_per_unit}
                    onChange={(e) => setNewMaterial(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="stock">Current Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={newMaterial.current_stock}
                    onChange={(e) => setNewMaterial(prev => ({ ...prev, current_stock: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={newMaterial.supplier}
                  onChange={(e) => setNewMaterial(prev => ({ ...prev, supplier: e.target.value }))}
                  placeholder="Supplier name"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMaterial} disabled={!newMaterial.name}>
                Add Material
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="inventory" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="jobs">Job Assignments</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="h-5 w-5" />
                <span>Material Inventory</span>
              </CardTitle>
              <CardDescription>
                {materials.length} materials in inventory
              </CardDescription>
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No materials found</p>
                  <p className="text-sm">Add your first material to get started</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Cost/Unit</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.map((material) => {
                        const stockStatus = getStockStatus(material);
                        const StatusIcon = stockStatus.icon;
                        
                        return (
                          <TableRow key={material.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{material.name}</div>
                                {material.description && (
                                  <div className="text-sm text-muted-foreground">{material.description}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {material.category.charAt(0).toUpperCase() + material.category.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono">{material.current_stock}</TableCell>
                            <TableCell>{material.unit}</TableCell>
                            <TableCell>${material.cost_per_unit.toFixed(2)}</TableCell>
                            <TableCell>{material.supplier || '—'}</TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <StatusIcon className={`h-4 w-4 ${
                                  stockStatus.status === 'low' ? 'text-red-500' :
                                  stockStatus.status === 'medium' ? 'text-yellow-500' : 'text-green-500'
                                }`} />
                                <span className="text-sm capitalize">{stockStatus.status}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Job Material Assignments</CardTitle>
              <CardDescription>
                Materials assigned to specific jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobMaterials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No materials assigned to jobs yet</p>
                  <p className="text-sm">Start assigning materials to track usage</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Allocated</TableHead>
                        <TableHead>Used</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Date Assigned</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobMaterials.map((jobMaterial) => (
                        <TableRow key={jobMaterial.id}>
                          <TableCell>
                            <div className="font-medium">{jobMaterial.material?.name}</div>
                          </TableCell>
                          <TableCell className="font-mono">#{jobMaterial.job_id}</TableCell>
                          <TableCell>{jobMaterial.quantity_allocated}</TableCell>
                          <TableCell>{jobMaterial.quantity_used}</TableCell>
                          <TableCell>
                            <Badge variant={jobMaterial.location === 'job site' ? 'default' : 'secondary'}>
                              {jobMaterial.location}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(jobMaterial.date_assigned).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>
                Track orders and deliveries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Purchase order tracking coming soon</p>
                <p className="text-sm">This feature will help you track orders and deliveries</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}