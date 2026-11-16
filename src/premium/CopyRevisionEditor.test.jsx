import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import CopyRevisionEditor from './CopyRevisionEditor';
afterEach(cleanup);
const campaign={campaign_id:'c',version:3},variant={variant_id:'v',current_revision_id:'r',workflow:'review',current_content:{title:null,body:'Draft copy\nCTA: Call us',caption:'Caption',alt_text:null}};
const setup=(over={})=>render(<CopyRevisionEditor enabled campaign={campaign} variant={variant} {...over}/>);
it('accessible copy/CTA form saves a new draft and announces fresh approval requirement',async()=>{
 const onSave=vi.fn().mockResolvedValue({version:4});setup({onSave});fireEvent.click(screen.getByText('Correct copy / CTA'));
 const body=screen.getByLabelText('Post copy and call to action');fireEvent.change(body,{target:{value:'Corrected\nCTA: Book a call'}});fireEvent.click(screen.getByText('Save new draft'));
 await waitFor(()=>expect(onSave).toHaveBeenCalledWith({title:null,body:'Corrected\nCTA: Book a call',caption:'Caption',alt_text:null},{version:3,revision:'r'}));
 expect(await screen.findByRole('status')).toHaveTextContent('new draft');expect(screen.getByRole('status')).toHaveTextContent('approve');
});
it('failed save preserves customer corrections and explains ambiguity',async()=>{
 const onSave=vi.fn().mockRejectedValue(new Error('Save unconfirmed. Check the saved campaign.'));setup({onSave});fireEvent.click(screen.getByText('Correct copy / CTA'));fireEvent.change(screen.getByLabelText('Post copy and call to action'),{target:{value:'Keep this correction'}});fireEvent.click(screen.getByText('Save new draft'));
 expect(await screen.findByRole('alert')).toHaveTextContent('unconfirmed');expect(screen.getByLabelText('Post copy and call to action')).toHaveValue('Keep this correction');
});
it('a changed revision/version refuses saving stale edits while retaining text',()=>{
 const onSave=vi.fn(),view=setup({onSave});fireEvent.click(screen.getByText('Correct copy / CTA'));fireEvent.change(screen.getByLabelText('Post copy and call to action'),{target:{value:'Unsaved'}});
 view.rerender(<CopyRevisionEditor enabled onSave={onSave} campaign={{...campaign,version:4}} variant={{...variant,current_revision_id:'r2'}}/>);
 expect(screen.getByText('Save new draft')).toBeDisabled();expect(screen.getByLabelText('Post copy and call to action')).toHaveValue('Unsaved');expect(screen.getByRole('alert')).toHaveTextContent('changed');expect(onSave).not.toHaveBeenCalled();
});
it('read-only, published and unverified capability never expose an edit form',()=>{
 const a=setup({readOnly:true});expect(screen.queryByText('Correct copy / CTA')).not.toBeInTheDocument();a.unmount();
 const b=setup({variant:{...variant,workflow:'published'}});expect(screen.queryByText('Correct copy / CTA')).not.toBeInTheDocument();b.unmount();setup({enabled:false});expect(screen.queryByText('Correct copy / CTA')).not.toBeInTheDocument();
});
