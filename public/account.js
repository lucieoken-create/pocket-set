export function mountAccount(container,sync,auth){
  let shown='uninitialized',view='signin',busy=false,recovery=false;
  function message(text,isError=false){const el=container.querySelector('.auth-message');if(el){el.textContent=text;el.setAttribute('role',isError?'alert':'status');}}
  function render(force=false){
    const st=sync.state(),key=`${st.loading}:${st.userId}:${recovery}`;
    if(!force&&key===shown)return;shown=key;
    if(st.loading){container.innerHTML='<p class="account-note">Checking your sign-in…</p>';return;}
    if(st.ready&&!recovery){
      container.innerHTML='<div class="account-bar"><span></span><button type="button" class="sync-button">Sign out</button></div><p class="auth-message"></p>';
      container.querySelector('span').textContent=st.email||'Signed in';
      container.querySelector('button').onclick=async event=>{
        if(sync.state().pending&&!window.confirm('Some weights are still waiting to sync. Their device copy will be kept for this account. Sign out anyway?'))return;
        event.currentTarget.disabled=true;
        const {error}=await auth.signOut({scope:'local'});
        if(error){message('Couldn’t sign out. Please retry.',true);const button=container.querySelector('button');if(button)button.disabled=false;}
      };return;
    }
    const signup=view==='signup';
    container.innerHTML=`<div class="auth-card"><h2>${recovery?'Choose a new password':signup?'Create your Pocket Set account':'Welcome to Pocket Set'}</h2><p>${recovery?'Save a new password for this account.':'Sign in with the same account on each device to keep your weights together.'}</p><form id="auth-form">${recovery?'':'<label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required>'}<label for="auth-password">${recovery?'New password':'Password'}</label><input id="auth-password" name="password" type="password" autocomplete="${signup||recovery?'new-password':'current-password'}" minlength="${signup||recovery?12:1}" required>${signup||recovery?'<small>Use at least 12 characters.</small>':''}<button class="save" type="submit">${recovery?'Save new password':signup?'Create account':'Sign in'}</button><p class="auth-message" role="status"></p></form>${recovery?'':'<button type="button" class="auth-switch">'+(signup?'Already have an account? Sign in':'New here? Create an account')+'</button>'}<p class="account-note">${signup?'Supabase handles your account and stores your weights. Existing device weights are imported only when you choose.':'Your original device weights stay on this browser until you choose to import them.'}</p></div>`;
    container.querySelector('.auth-switch')?.addEventListener('click',()=>{if(busy)return;view=signup?'signin':'signup';render(true);});
    container.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const form=event.currentTarget;if(!form.reportValidity())return;
      const email=form.elements.email?.value.trim();const password=form.elements.password.value;
      const button=form.querySelector('button');busy=true;button.disabled=true;message('Please wait…');
      try{
        if(recovery){
          const {error}=await auth.updateUser({password});if(error)throw error;
          recovery=false;render(true);
        }else if(signup){
          const {data,error}=await auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/'}});if(error)throw error;
          form.elements.password.value='';
          if(!data.session)message('Check your email to confirm your account, then return here and sign in. Your device weights have not been imported.');
        }else{
          const {error}=await auth.signInWithPassword({email,password});if(error)throw error;
        }
      }catch(error){
        // Auth errors are displayed as text, never interpreted as HTML.
        message(error.message||'Sign-in is unavailable. Please try again.',true);
      }finally{busy=false;if(button.isConnected)button.disabled=false;}
    };
  }
  auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovery=true;render(true);}});
  sync.subscribe(()=>render());render();
}
